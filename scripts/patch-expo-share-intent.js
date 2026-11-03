#!/usr/bin/env node
/* global __dirname */
// Runs after `npm install` / `npm ci` (postinstall), next to
// patch-expo-widgets.js and for the same reason: in a build re-signed on the
// phone (Feather, SideStore, the "Build LiveContainer IPA" workflow) the App
// Group is the certificate's, not group.art.muxp.hanetcl. The share extension
// ("Compartir a HaNet") leaves the shared file in the App Group and the app
// reads it from there, so both must use the group the signature grants.
//
// It patches two files of expo-share-intent: the app's native module and the
// template of the share extension's view controller (the config plugin copies
// it into ios/ on prebuild).
const fs = require('fs');
const path = require('path');

const MARK = '// HaNet patch: App Group from the provisioning profile';
const root = path.join(__dirname, '..', 'node_modules', 'expo-share-intent');

const RESOLVER = `
${MARK} (scripts/patch-expo-share-intent.js).
// A re-signed build has the signing certificate's App Group, not the declared
// one; the app and the share extension must both pick the same one.
func hanetShareProvisionedAppGroups() -> [String] {
  var urls: [URL] = []
  if let own = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") {
    urls.append(own)
  }
  // The extension (HaNet.app/PlugIns/X.appex) may only have the app's profile.
  if Bundle.main.bundleURL.pathExtension == "appex" {
    urls.append(Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("embedded.mobileprovision"))
  }
  for url in urls {
    guard let data = try? Data(contentsOf: url),
          let start = data.range(of: Data("<?xml".utf8)),
          let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
          let plist = try? PropertyListSerialization.propertyList(from: data.subdata(in: start.lowerBound..<end.upperBound), format: nil) as? [String: Any],
          let entitlements = plist["Entitlements"] as? [String: Any],
          let groups = entitlements["com.apple.security.application-groups"] as? [String] else {
      continue
    }
    let concrete = groups.filter { !$0.contains("*") }
    if !concrete.isEmpty {
      return concrete
    }
  }
  return []
}

func hanetShareResolveAppGroup(_ declared: String?) -> String? {
  let granted = hanetShareProvisionedAppGroups()
  // App Store builds have no profile; a profile with the declared group needs nothing.
  if granted.isEmpty {
    return declared
  }
  if let declared, granted.contains(declared) {
    return declared
  }
  let usable = granted.filter { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil }
  let pool = (usable.isEmpty ? granted : usable).sorted()
  // SideStore and AltStore append the team: group.art.muxp.hanetcl.TEAMID.
  if let declared, let adjusted = pool.first(where: { $0.hasPrefix(declared) }) {
    return adjusted
  }
  return pool.first(where: { $0.contains("hanetcl") }) ?? pool.first ?? declared
}
`;

const PATCHES = [
  {
    file: path.join(root, 'ios', 'ExpoShareIntentModule.swift'),
    original: `let appGroupIdentifier: String? =
            Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier")
            as? String`,
    patched: `let appGroupIdentifier: String? = hanetShareResolveAppGroup(
            Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier")
            as? String)`,
  },
  {
    file: path.join(root, 'plugin', 'build', 'ios', 'ShareExtensionViewController.swift'),
    original: 'let hostAppGroupIdentifier: String = "<GROUPIDENTIFIER>"',
    patched: 'let hostAppGroupIdentifier: String = hanetShareResolveAppGroup("<GROUPIDENTIFIER>") ?? "<GROUPIDENTIFIER>"',
  },
  {
    // The extension's target name comes from iosShareExtensionName without
    // spaces, so "HaNet" would clash with the app's own target. This lets
    // the name in the share sheet be set apart: iosShareExtensionDisplayName.
    file: path.join(root, 'plugin', 'build', 'ios', 'writeIosShareExtensionFiles.js'),
    original: 'CFBundleDisplayName: parameters.iosShareExtensionName ||',
    patched: 'CFBundleDisplayName: parameters.iosShareExtensionDisplayName || parameters.iosShareExtensionName ||',
    js: true,
  },
];

let failed = false;
for (const { file, original, patched, js } of PATCHES) {
  if (!fs.existsSync(file)) continue; // expo-share-intent is not installed in this checkout.
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes(MARK) || (js && source.includes(patched))) continue;
  if (!source.includes(original)) {
    console.error(`patch-expo-share-intent: ${path.basename(file)} changed upstream; review scripts/patch-expo-share-intent.js after updating expo-share-intent.`);
    failed = true;
    continue;
  }
  source = js ? source.replace(original, patched) : `${source.replace(original, patched).trimEnd()}\n${RESOLVER}`;
  fs.writeFileSync(file, source);
}
if (failed) process.exit(1);
console.log('patch-expo-share-intent: the share extension uses the App Group the signature grants.');
