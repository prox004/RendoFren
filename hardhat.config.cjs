require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    baseSepolia: {
      url: process.env.BASE_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.WORKER_PRIVATE_KEY ? [process.env.WORKER_PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
};
