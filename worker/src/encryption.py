import os
import hashlib
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

class EncryptionManager:
    """Handles secure AES-256 encryption and decryption for RendoFren project files and render results"""
    
    @staticmethod
    def derive_key(passphrase: str) -> bytes:
        """Derive a secure 32-byte (256-bit) key from a passphrase using SHA-256"""
        return hashlib.sha256(passphrase.encode('utf-8')).digest()
        
    @classmethod
    def encrypt_file(cls, input_path: str, output_path: str, passphrase: str) -> bool:
        """
        Encrypt a file using AES-256-CBC.
        Saves the 16-byte random IV at the start of the output file.
        """
        try:
            key = cls.derive_key(passphrase)
            iv = os.urandom(16)
            cipher = AES.new(key, AES.MODE_CBC, iv)
            
            with open(input_path, 'rb') as f_in:
                plaintext = f_in.read()
                
            ciphertext = cipher.encrypt(pad(plaintext, AES.block_size))
            
            with open(output_path, 'wb') as f_out:
                f_out.write(iv)
                f_out.write(ciphertext)
                
            return True
        except Exception as e:
            print(f"[Encryption] Error encrypting file {input_path}: {e}")
            return False
            
    @classmethod
    def decrypt_file(cls, input_path: str, output_path: str, passphrase: str) -> bool:
        """
        Decrypt an AES-256-CBC encrypted file.
        Reads the first 16 bytes as the IV, and decrypts the remainder.
        """
        try:
            key = cls.derive_key(passphrase)
            
            with open(input_path, 'rb') as f_in:
                iv = f_in.read(16)
                ciphertext = f_in.read()
                
            if len(iv) < 16:
                raise ValueError("Encrypted file is too short (missing or corrupt IV)")
                
            cipher = AES.new(key, AES.MODE_CBC, iv)
            plaintext = unpad(cipher.decrypt(ciphertext), AES.block_size)
            
            with open(output_path, 'wb') as f_out:
                f_out.write(plaintext)
                
            return True
        except Exception as e:
            print(f"[Encryption] Error decrypting file {input_path}: {e}")
            return False
