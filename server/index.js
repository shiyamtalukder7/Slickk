const { createServer } = require('node:http');

const { createApp } = require('./src/app');
const { config } = require('./src/config');

const app = createApp();
const server = createServer(app);

server.listen(config.port, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log(' SLICKK LOCAL INTELLIGENCE IS ONLINE');
  console.log(` Port: ${config.port}`);
  console.log(` Model: ${config.ollamaModel}`);
  console.log(` Database: ${config.databasePath}`);
  console.log(` Environment: ${config.nodeEnv}`);
  console.log('========================================');
  console.log('');
});

function shutdown(signal) {
  console.log(`\n${signal} received. Closing Slickk safely...`);

  server.close(() => {
    app.locals.conversationStore?.close();
    app.locals.curriculumStore?.close();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
