/**
 * scheduler/costEstimator.js
 * Estimates render cost, time, and recommends GPU tier for a job
 */

const PRICE_PER_FRAME_ETH = parseFloat(process.env.PRICE_PER_FRAME_ETH || '0.0001');

// Benchmark scores mapped to typical render times per frame (seconds)
// Based on real Blender Cycles benchmark data
const GPU_TIERS = [
  { name: 'Entry (GTX 1050 / RX 570)',       minScore: 0,    maxScore: 400,  frameTimeSec: 90  },
  { name: 'Mid-Range (RTX 2060 / RX 6600)',  minScore: 400,  maxScore: 800,  frameTimeSec: 30  },
  { name: 'High-End (RTX 3080 / RX 6900)',   minScore: 800,  maxScore: 1400, frameTimeSec: 10  },
  { name: 'Flagship (RTX 4090 / RX 7900)',   minScore: 1400, maxScore: 2000, frameTimeSec: 4   },
];

class CostEstimator {
  /**
   * Estimate the cost and time for a render job
   * @param {object} params
   * @param {number} params.frameCount       Total number of frames
   * @param {string} params.resolution       e.g. "1920x1080"
   * @param {number} params.samples          Cycles samples per frame
   * @param {number} params.benchmarkScore   Worker benchmark score (optional)
   * @returns {object} estimation result
   */
  static estimate({ frameCount, resolution = '1920x1080', samples = 128, benchmarkScore = 300 }) {
    const [width, height] = resolution.split('x').map(Number);
    const resolutionMultiplier = (width * height) / (1920 * 1080); // relative to 1080p
    const sampleMultiplier = samples / 128; // relative to 128 samples baseline

    // Find matching GPU tier
    const tier = GPU_TIERS.find(t => benchmarkScore >= t.minScore && benchmarkScore < t.maxScore)
      || GPU_TIERS[GPU_TIERS.length - 1];

    const frameTimeSec = tier.frameTimeSec * resolutionMultiplier * sampleMultiplier;
    const totalTimeSec = frameTimeSec * frameCount;
    const totalTimeMin = Math.ceil(totalTimeSec / 60);

    // Cost model: base price per frame + resolution and sample premium (localhost customization: flat-rate model per job, do not scale by frame count)
    const pricePerFrame = PRICE_PER_FRAME_ETH * resolutionMultiplier * sampleMultiplier;
    const totalCostEth = parseFloat(pricePerFrame.toFixed(6));

    return {
      frameCount,
      resolution,
      samples,
      benchmarkScore,
      recommendedTier: tier.name,
      estimatedTimePerFrameSec: Math.round(frameTimeSec),
      estimatedTotalTimeSec: Math.round(totalTimeSec),
      estimatedTotalTimeMin: totalTimeMin,
      estimatedCostEth: totalCostEth,
      pricePerFrameEth: parseFloat(pricePerFrame.toFixed(6)),
    };
  }

  /**
   * Split a frame range into segments for parallel worker distribution
   */
  static splitFrameSegments(startFrame, endFrame, workerCount) {
    const totalFrames = endFrame - startFrame + 1;
    const count = Math.max(1, Math.min(workerCount, totalFrames));
    const segmentSize = Math.ceil(totalFrames / count);
    const segments = [];

    for (let i = 0; i < count; i++) {
      const segStart = startFrame + i * segmentSize;
      const segEnd = Math.min(segStart + segmentSize - 1, endFrame);
      if (segStart > endFrame) break;
      segments.push({ startFrame: segStart, endFrame: segEnd });
    }
    return segments;
  }
}

module.exports = CostEstimator;
