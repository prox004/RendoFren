/**
 * exports/exportEngine.js
 * Assembles rendered frames into final MP4/GIF/ZIP export using FFmpeg
 */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../logger');

ffmpeg.setFfmpegPath(ffmpegPath);
fs.mkdirSync(config.EXPORTS_DIR, { recursive: true });

class ExportEngine {
  /**
   * Assemble a sequence of PNG frames into an MP4 video
   * @param {string[]} framePaths - Ordered array of absolute PNG file paths
   * @param {object} options
   * @param {number} options.fps - Frames per second (default 24)
   * @param {string} options.resolution - Output resolution e.g. "1920x1080"
   * @returns {Promise<string>} - Absolute path to the generated MP4
   */
  static assembleMp4(framePaths, { fps = 24, resolution = '1920x1080' } = {}) {
    return new Promise((resolve, reject) => {
      if (!framePaths || framePaths.length === 0) {
        return reject(new Error('No frames provided for MP4 assembly'));
      }

      // Write a temp file list for ffmpeg concat demuxer
      const listPath = path.join(config.EXPORTS_DIR, `${uuidv4()}_list.txt`);
      const listContent = framePaths.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(listPath, listContent, 'utf8');

      const outputPath = path.join(config.EXPORTS_DIR, `render_${uuidv4()}.mp4`);
      const [w, h] = resolution.split('x').map(Number);

      logger.info(`[Export] Assembling ${framePaths.length} frames → MP4 at ${fps}fps`);

      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .videoCodec('libx264')
        .outputOptions([
          `-r ${fps}`,
          `-vf scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
          '-pix_fmt yuv420p',
          '-crf 18',
          '-preset fast',
        ])
        .output(outputPath)
        .on('end', () => {
          fs.unlinkSync(listPath);
          logger.info(`[Export] MP4 ready: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(`[Export] FFmpeg error: ${err.message}`);
          if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Create a ZIP archive of frame files
   * @param {string[]} framePaths - Ordered array of absolute file paths
   * @returns {Promise<string>} - Absolute path to the ZIP file
   */
  static async assembleZip(framePaths) {
    // Use Node's built-in archiver-free zip via native approach
    const AdmZip = await import('adm-zip').then(m => m.default || m).catch(() => null);
    if (!AdmZip) {
      throw new Error('adm-zip not installed. Run: npm install adm-zip');
    }
    const zip = new AdmZip();
    for (const fp of framePaths) {
      zip.addLocalFile(fp);
    }
    const zipPath = path.join(config.EXPORTS_DIR, `frames_${uuidv4()}.zip`);
    zip.writeZip(zipPath);
    logger.info(`[Export] ZIP ready: ${zipPath}`);
    return zipPath;
  }

  /**
   * Simple ZIP using Node's built-in streams + archiving (no adm-zip dependency)
   */
  static assembleZipNative(framePaths) {
    return new Promise((resolve, reject) => {
      const zipPath = path.join(config.EXPORTS_DIR, `frames_${uuidv4()}.zip`);
      const output = fs.createWriteStream(zipPath);

      // Use Node's built-in zlib + manual ZIP header approach for simplicity
      // For full functionality in production, use archiver package
      const Archive = require('archiver');
      const archive = Archive('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        logger.info(`[Export] Native ZIP ready: ${zipPath} (${archive.pointer()} bytes)`);
        resolve(zipPath);
      });

      archive.on('error', reject);
      archive.pipe(output);

      for (const fp of framePaths) {
        archive.file(fp, { name: path.basename(fp) });
      }

      archive.finalize();
    });
  }
}

module.exports = ExportEngine;
