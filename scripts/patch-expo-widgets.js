#!/usr/bin/env node
/* global __dirname */
// Runs after `npm install` / `npm ci` (postinstall). It changes one line of
// expo-widgets so the widget and the Live Activity find their App Group in a
// re-signed build.
//
// Why: the app writes what the widget and the Live Activity show into the
// App Group named in Info.plist (group.art.muxp.hanetcl). A build re-signed
// on the phone with another certificate (the IPA from the "Build LiveContainer
// IPA" workflow) gets that certificate's group instead, e.g.
// group.art.muxp.hanetcl.TEAMID or group.0541a8a73a5a6c62.1. Then the app
// writes where the widget never reads: the widget keeps its first layout and
// the Live Activity shows up empty.
//
// The patch: when the build carries a provisioning profile (only re-signed
// and development builds do; App Store builds don't), use the App Group that
// profile actually grants. If it grants the one in Info.plist, nothing changes.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'expo-widgets', 'ios', 'WidgetsStorage.swift');
const MARK = '// HaNet patch: App Group from the provisioning profile';
const ORIGINAL = 'public static var appGroupIdentifier: String? = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String';

const RESOLVER = `
${MARK} (scripts/patch-expo-widgets.js).
// A re-signed build has the signing certificate's App Group, not the one in
// Info.plist; the app and the widget extension must both pick the same one.
private func hanetDeclaredAppGroup() -> String? {
  Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String
}

private func hanetProvisionedAppGroups() -> [String] {
  var urls: [URL] = []
  if let own = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision") {
    urls.append(own)
  }
  // The widget extension (HaNet.app/PlugIns/X.appex) may only have the app's profile.
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

func hanetResolveAppGroup() -> String? {
  let declared = hanetDeclaredAppGroup()
  let granted = hanetProvisionedAppGroups()
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

if (!fs.existsSync(file)) {
  // Nothing to patch (e.g. expo-widgets is not installed in this checkout).
  process.exit(0);
}

let source = fs.readFileSync(file, 'utf8');
if (source.includes(MARK)) process.exit(0);
if (!source.includes(ORIGINAL)) {
  console.error('patch-expo-widgets: WidgetsStorage.swift changed upstream; review scripts/patch-expo-widgets.js after updating expo-widgets.');
  process.exit(1);
}
source = source.replace(ORIGINAL, 'public static var appGroupIdentifier: String? = hanetResolveAppGroup()');
source = `${source.trimEnd()}\n${RESOLVER}`;
fs.writeFileSync(file, source);
console.log('patch-expo-widgets: widgets and Live Activities use the App Group the signature grants.');
