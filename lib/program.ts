import { AnchorProvider, BN, Idl, Program } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import idl from './idl/talkn_do.json';

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TALKN_DO_PROGRAM_ID ?? idl.address,
);
export const CONFIG_SEED = Buffer.from('config');
export const CHARITY_VAULT_SEED = Buffer.from('charity_vault');
export const CHALLENGE_SEED = Buffer.from('challenge');

export const getConfigPda = () => PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID)[0];
export const getCharityVaultPda = () =>
  PublicKey.findProgramAddressSync([CHARITY_VAULT_SEED], PROGRAM_ID)[0];
export const getChallengePda = (creator: PublicKey, id: BN) =>
  PublicKey.findProgramAddressSync(
    [CHALLENGE_SEED, creator.toBuffer(), id.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )[0];

export function getProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  return new Program(idl as Idl, provider);
}

export function toSol(lamports: BN | number) {
  const value = BN.isBN(lamports) ? lamports.toNumber() : lamports;
  return value / 1_000_000_000;
}
