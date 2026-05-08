const hre = require("hardhat");

async function main() {
  console.log("Starting deployment of RendoFrenEscrow...");

  const Escrow = await hre.ethers.getContractFactory("RendoFrenEscrow");
  const escrow = await Escrow.deploy();

  await escrow.waitForDeployment();

  const contractAddress = await escrow.getAddress();
  console.log("RendoFrenEscrow deployed to:", contractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
