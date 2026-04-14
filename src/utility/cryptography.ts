import crypto from "crypto";
import fs from "fs";
import path from "path";

export function encryptKey(sessionKey: string): string {
  try {
    const publicKeyPath = fs.existsSync("/etc/secrets/master_public_key.pem")
      ? "/etc/secrets/master_public_key.pem"
      : path.join(process.cwd(), "master_public_key.pem");

    const publicKey = fs.readFileSync(publicKeyPath, "utf8");

    const encryptedBuffer = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(sessionKey, "utf8"),
    );

    return encryptedBuffer.toString("base64");
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to secure the tenant key.");
  }
}

export function decryptKey(encryptedKeyBase64: string): string {
  try {
    // 1. Read the private key from the file system
    const rootDir = process.cwd();
    const keyFilePath = path.join(rootDir, "master_private_key.pem");
    const privateKey = fs.readFileSync(keyFilePath, "utf8");

    // 2. Convert the Supabase string to a Buffer
    const buffer = Buffer.from(encryptedKeyBase64, "base64");

    // 3. Decrypt using the private key
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        // These MUST match the settings used during encryption
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      buffer,
    );

    return decrypted.toString("utf8");
  } catch (error) {
    console.error(
      "Decryption failed. Ensure the key file path and padding are correct.",
      error,
    );
    throw error;
  }
}

export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki", // Standard for public keys
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8", // Standard for private keys
      format: "pem",
    },
  });

  // Save to files
  fs.writeFileSync("master_public_key.pem", publicKey);
  fs.writeFileSync("master_private_key.pem", privateKey);

  console.log("Keys generated successfully without OpenSSL!");
}
