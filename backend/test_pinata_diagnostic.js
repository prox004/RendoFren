const pinata = require('./src/ipfs/pinata');
const logger = require('./src/logger');

async function test() {
  logger.info('Testing Pinata API Authentication...');
  const success = await pinata.testAuthentication();
  logger.info(`Authentication result: ${success ? 'SUCCESS' : 'FAILED'}`);
}

test();
