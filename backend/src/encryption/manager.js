/**
 * encryption/manager.js
 * AES-256 per-job encryption and decryption using Node.js native crypto module.
 * Fully compatible with Python PyCryptodome AES-CBC format.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

class EncryptionManager {
  /**
   * Generate a unique 256-bit AES key for a job
   */
  static generateJobKey() {
    return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''); // 64 hex chars = 256-bit key
  }

  /**
   * Derive a secure 32-byte key using SHA-256 (matches Python digest)
   */
  static deriveKey(passphrase) {
    return crypto.createHash('sha256').update(passphrase, 'utf8').digest();
  }

  /**
   * Encrypt a file on disk, prepending 16-byte IV to the ciphertext.
   * Matches worker/src/encryption.py implementation exactly.
   */
  static encryptFile(srcPath, destPath, passphrase) {
    try {
      const key = EncryptionManager.deriveKey(passphrase);
      const iv = crypto.randomBytes(16);
      
      const plaintext = fs.readFileSync(srcPath);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final()
      ]);
      
      // Write IV + Ciphertext
      const output = Buffer.concat([iv, ciphertext]);
      fs.writeFileSync(destPath, output);
      
      logger.info(`[Encryption] Encrypted ${path.basename(srcPath)} → ${path.basename(destPath)}`);
      return true;
    } catch (err) {
      logger.error(`[Encryption] Failed to encrypt ${srcPath}: ${err.message}`);
      return false;
    }
  }

  /**
   * Decrypt a file on disk, reading the first 16 bytes as IV.
   * Matches worker/src/encryption.py implementation exactly.
   */
  static decryptFile(srcPath, destPath, passphrase) {
    try {
      const key = EncryptionManager.deriveKey(passphrase);
      const input = fs.readFileSync(srcPath);
      
      if (input.length < 16) {
        throw new Error('Encrypted file too short (missing IV)');
      }
      
      const iv = input.subarray(0, 16);
      const ciphertext = input.subarray(16);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
      
      fs.writeFileSync(destPath, plaintext);
      logger.info(`[Encryption] Decrypted ${path.basename(srcPath)} → ${path.basename(destPath)}`);
      return true;
    } catch (err) {
      logger.error(`[Encryption] Failed to decrypt ${srcPath}: ${err.message}`);
      return false;
    }
  }
}

module.exports = EncryptionManager;
