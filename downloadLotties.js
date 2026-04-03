const https = require('https');
const fs = require('fs');

const fileUrls = [
  { name: 'calendar.json', url: 'https://cdn.lordicon.com/wxnxiano.json' },
  { name: 'events.json', url: 'https://cdn.lordicon.com/kpdhbnwt.json' },
  { name: 'wallet.json', url: 'https://cdn.lordicon.com/pimvysaa.json' },
  { name: 'notes.json', url: 'https://cdn.lordicon.com/wzwygmng.json' },
  { name: 'classes.json', url: 'https://cdn.lordicon.com/mecwbjxg.json' },
  { name: 'feed.json', url: 'https://cdn.lordicon.com/puvaffet.json' },
  { name: 'empty_calendar.json', url: 'https://cdn.lordicon.com/abmnejdk.json' }
];

fileUrls.forEach(({ name, url }) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      fs.writeFileSync(`./assets/lottie/${name}`, data);
      console.log(`Downloaded ${name}`);
    });
  }).on('error', (e) => {
    console.error(e);
  });
});
