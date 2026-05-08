// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RendoFrenEscrow
 * @dev Secure decentralized job escrow system for distributed GPU rendering.
 * Creators lock ETH funds; rewards are released to workers on verified job completion.
 */
contract RendoFrenEscrow {
    address public owner;

    enum JobStatus { NonExistent, Locked, Completed, Refunded }

    struct RenderJob {
        string jobId;
        address payable creator;
        address payable worker;
        uint256 rewardAmount;
        JobStatus status;
        string assetCid;
        string resultCid;
    }

    // Mapping from unique string jobId to RenderJob
    mapping(string => RenderJob) public jobs;
    // Map to track total earnings of each worker on-chain
    mapping(address => uint256) public workerEarnings;

    event JobCreated(string indexed jobId, address indexed creator, uint256 rewardAmount, string assetCid);
    event JobCompleted(string indexed jobId, address indexed worker, string resultCid, uint256 rewardAmount);
    event JobRefunded(string indexed jobId, address indexed creator, uint256 refundAmount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner (orchestrator backend) can execute this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Lock funds in escrow for a new render job.
     */
    function lockJobEscrow(string calldata jobId, string calldata assetCid) external payable {
        require(msg.value > 0, "Must deposit ETH to lock escrow");
        require(jobs[jobId].status == JobStatus.NonExistent, "Job already exists");

        jobs[jobId] = RenderJob({
            jobId: jobId,
            creator: payable(msg.sender),
            worker: payable(address(0)),
            rewardAmount: msg.value,
            status: JobStatus.Locked,
            assetCid: assetCid,
            resultCid: ""
        });

        emit JobCreated(jobId, msg.sender, msg.value, assetCid);
    }

    event EarningsWithdrawn(address indexed worker, uint256 amount);

    /**
     * @dev Complete job and accumulate locked escrow funds under the worker's address.
     */
    function completeJob(string calldata jobId, address payable worker, string calldata resultCid) external onlyOwner {
        RenderJob storage job = jobs[jobId];
        require(job.status == JobStatus.Locked, "Job is not in locked state");
        require(worker != address(0), "Invalid worker address");

        job.worker = worker;
        job.resultCid = resultCid;
        job.status = JobStatus.Completed;

        uint256 reward = job.rewardAmount;
        workerEarnings[worker] += reward;

        emit JobCompleted(jobId, worker, resultCid, reward);
    }

    /**
     * @dev Withdraw accumulated render earnings from the contract.
     */
    function withdrawEarnings() external {
        uint256 amount = workerEarnings[msg.sender];
        require(amount > 0, "No earnings available to withdraw");

        workerEarnings[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH withdrawal transfer failed");

        emit EarningsWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Refund creator if a job fails or is aborted.
     */
    function refundJob(string calldata jobId) external onlyOwner {
        RenderJob storage job = jobs[jobId];
        require(job.status == JobStatus.Locked, "Job is not in locked state");

        job.status = JobStatus.Refunded;
        uint256 refund = job.rewardAmount;

        (bool success, ) = job.creator.call{value: refund}("");
        require(success, "Refund transfer to creator failed");

        emit JobRefunded(jobId, job.creator, refund);
    }

    /**
     * @dev Allow upgrading/transferring orchestrator owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        owner = newOwner;
    }

    /**
     * @dev Fetch full details of a render job.
     */
    function getJobDetails(string calldata jobId) external view returns (
        string memory, address, address, uint256, JobStatus, string memory, string memory
    ) {
        RenderJob memory j = jobs[jobId];
        return (j.jobId, j.creator, j.worker, j.rewardAmount, j.status, j.assetCid, j.resultCid);
    }
}
