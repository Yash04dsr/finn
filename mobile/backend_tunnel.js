const ngrok = require('@expo/ngrok');
(async () => {
  try {
    const url = await ngrok.connect({ addr: 8000, proto: 'http' });
    console.log('BACKEND_TUNNEL_URL=' + url);
    setInterval(() => {}, 1 << 30);
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  }
})();
