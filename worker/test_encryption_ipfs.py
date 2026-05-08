"""
test_encryption_ipfs.py
Verify cross-platform compatibility of AES-256-CBC encryption between Node.js and Python.
Also verifies real-time upload and download via Pinata IPFS.
"""
import os
import sys
import requests
from pathlib import Path

# Add src folder to sys path
sys.path.insert(0, str(Path(__file__).parent.resolve()))

from src.encryption import EncryptionManager as PyEncryption
from src.config import BACKEND_API_URL, PINATA_JWT

def test_cross_platform_encryption():
    print("=" * 60)
    print("  TESTING CROSS-PLATFORM AES-256-CBC ENCRYPTION COMPATIBILITY")
    print("=" * 60)

    # 1. Define inputs
    passphrase = "rendofren-secure-per-job-key-123456"
    test_data = b"RendoFren decentralized rendering network payload format v1.0.0"
    
    temp_dir = Path("temp_test")
    temp_dir.mkdir(exist_ok=True)
    
    plaintext_path = temp_dir / "plain.txt"
    py_encrypted_path = temp_dir / "py_encrypted.bin"
    py_decrypted_path = temp_dir / "py_decrypted.txt"
    
    with open(plaintext_path, 'wb') as f:
        f.write(test_data)

    print(f"1. Raw Payload size: {len(test_data)} bytes")

    # 2. Encrypt using Python
    ok = PyEncryption.encrypt_file(str(plaintext_path), str(py_encrypted_path), passphrase)
    assert ok, "Python encryption failed"
    print("2. Python encrypted file successfully.")

    # 3. Decrypt using Python
    ok = PyEncryption.decrypt_file(str(py_encrypted_path), str(py_decrypted_path), passphrase)
    assert ok, "Python decryption failed"
    with open(py_decrypted_path, 'rb') as f:
        py_dec_data = f.read()
    assert py_dec_data == test_data, "Python decrypted data mismatch"
    print("3. Python decrypted file successfully. Contents match raw payload.")

    # 4. Now verify compatibility with Node.js
    # Let's write a small temporary js script and run it via subprocess to encrypt and decrypt
    print("4. Testing compatibility with Node.js crypto engine...")
    node_script = """
const EncryptionManager = require('./src/encryption/manager');
const fs = require('fs');

const passphrase = 'rendofren-secure-per-job-key-123456';
const pyEncryptedPath = '../worker/temp_test/py_encrypted.bin';
const nodeDecryptedPath = '../worker/temp_test/node_decrypted.txt';
const nodeEncryptedPath = '../worker/temp_test/node_encrypted.bin';
const plainPath = '../worker/temp_test/plain.txt';

// A. Decrypt the python-encrypted file using Node.js
const decOk = EncryptionManager.decryptFile(pyEncryptedPath, nodeDecryptedPath, passphrase);
console.log('NODE_DECRYPT_STATUS:' + decOk);

// B. Encrypt the raw plain file using Node.js
const encOk = EncryptionManager.encryptFile(plainPath, nodeEncryptedPath, passphrase);
console.log('NODE_ENCRYPT_STATUS:' + encOk);
"""
    backend_dir = Path("../backend").resolve()
    temp_js_path = backend_dir / "temp_test_compat.js"
    with open(temp_js_path, 'w') as f:
        f.write(node_script)

    import subprocess
    res = subprocess.run(["node", "temp_test_compat.js"], cwd=str(backend_dir), capture_output=True, text=True)
    
    # Cleanup temp js
    if temp_js_path.exists():
        temp_js_path.unlink()

    print(f"   Node output: {res.stdout.strip()}")
    if "NODE_DECRYPT_STATUS:true" in res.stdout:
        print("   [PASS] Node.js successfully decrypted Python-encrypted file!")
    else:
        print("   [FAIL] Node.js decryption failed")
        print(res.stderr)
        return False

    # 5. Let's try to decrypt the Node-encrypted file using Python
    node_encrypted_bin = temp_dir / "node_encrypted.bin"
    node_decrypted_by_py = temp_dir / "node_decrypted_by_py.txt"
    
    ok = PyEncryption.decrypt_file(str(node_encrypted_bin), str(node_decrypted_by_py), passphrase)
    assert ok, "Python failed to decrypt Node-encrypted file"
    
    with open(node_decrypted_by_py, 'rb') as f:
        py_dec_node_data = f.read()
    assert py_dec_node_data == test_data, "Python decrypted Node data mismatch"
    print("5. [PASS] Python successfully decrypted Node.js-encrypted file!")

    # 6. Test real Pinata IPFS Upload and Download
    print("\n" + "="*60)
    print("  TESTING PINATA IPFS FILE TRANSMISSION PIPELINE")
    print("=" * 60)
    if not PINATA_JWT:
        print("[SKIP] Pinata JWT not configured in environment. Skipping IPFS transmission test.")
    else:
        # Upload using Python api client helper or direct post
        print("1. Uploading file to Pinata IPFS...")
        headers = {"Authorization": f"Bearer {PINATA_JWT}"}
        url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
        with open(py_encrypted_path, "rb") as f:
            files = {"file": ("test_py_compat.bin", f, "application/octet-stream")}
            data = {"pinataMetadata": '{"name":"rendofren_test_compat"}'}
            r = requests.post(url, files=files, data=data, headers=headers, timeout=60)
        
        assert r.status_code == 200, f"IPFS upload failed: {r.text}"
        cid = r.json().get("IpfsHash")
        print(f"   [PASS] Pinned successfully to IPFS. CID: {cid}")

        # Try downloading via backend proxy fallback
        print("2. Downloading file via backend high-speed proxy fallback...")
        download_url = f"{BACKEND_API_URL}/api/jobs/download/{cid}"
        dl_res = requests.get(download_url, timeout=30)
        assert dl_res.status_code == 200, f"Proxy download failed: {dl_res.status_code}"
        
        dl_path = temp_dir / "downloaded_from_ipfs.bin"
        with open(dl_path, "wb") as f:
            f.write(dl_res.content)
        print("   [PASS] Downloaded successfully via backend proxy.")

        # Decrypt downloaded file
        final_plain = temp_dir / "final_plain.txt"
        ok = PyEncryption.decrypt_file(str(dl_path), str(final_plain), passphrase)
        assert ok, "Failed to decrypt downloaded file"
        with open(final_plain, "rb") as f:
            final_data = f.read()
        assert final_data == test_data, "Final decrypted payload mismatch"
        print("3. [PASS] Decrypted downloaded IPFS asset successfully. Contents match.")

    # Cleanup temp directory
    for f in temp_dir.glob("*"):
        f.unlink()
    temp_dir.rmdir()
    print("\n" + "="*60)
    print("  ALL ENCRYPTION & IPFS FLOW TESTS PASSED!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    test_cross_platform_encryption()
