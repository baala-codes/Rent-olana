import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type SendOptions,
  type TransactionSignature,
} from "@solana/web3.js";

/** The subset of `useWallet()` this module needs. */
export interface WalletSigner {
  publicKey: PublicKey;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: SendOptions
  ) => Promise<TransactionSignature>;
}

/**
 * Build a legacy transaction from `instructions`, hand it to the connected
 * wallet to sign and send, then wait for it to reach `confirmed`.
 *
 * Every program instruction is authorized by the single connected wallet, so
 * no extra keypair signers are involved. `feePayer` is the wallet; the portal
 * never touches a private key.
 */
export async function sendInstructions(
  connection: Connection,
  signer: WalletSigner,
  instructions: TransactionInstruction[],
  options?: { skipPreflight?: boolean }
): Promise<TransactionSignature> {
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(...instructions);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = latest.blockhash;

  const signature = await signer.sendTransaction(tx, connection, {
    skipPreflight: options?.skipPreflight ?? false,
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed"
  );
  if (confirmation.value.err) {
    throw new Error(`transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
}
