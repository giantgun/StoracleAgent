/**
 * Shared chain definitions for Zerodev on Sepolia
 */
import { defineChain } from "viem";

export const sepolia = defineChain({
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ZERODEV_RPC_URL!] },
    public: { http: [process.env.ZERODEV_RPC_URL!] },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://sepolia.etherscan.io",
    },
  },
  testnet: true,
});

export default sepolia;
