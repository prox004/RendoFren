const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

async function main() {
  console.log("Starting backend deployment of RendoFrenEscrow...");

  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.WORKER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("Error: BASE_RPC_URL or WORKER_PRIVATE_KEY is missing in your .env file!");
    process.exit(1);
  }

  // Connect to Base Sepolia
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deploying from wallet address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Wallet balance:", ethers.formatEther(balance), "ETH");

  // Load compiled artifact from root
  const artifactPath = path.join(__dirname, "../../artifacts/contracts/RendoFrenEscrow.sol/RendoFrenEscrow.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found at:", artifactPath);
    console.error("Please run compile first!");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode;

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log("Sending deployment transaction...");
  const contract = await factory.deploy();

  console.log("Waiting for deployment confirmation...");
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("==========================================");
  console.log("SUCCESS: RendoFrenEscrow deployed to:", contractAddress);
  console.log("==========================================");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
