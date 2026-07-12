'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/purity, react-hooks/set-state-in-effect */

import { BN } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Drawer, Progress, Upload } from 'antd';
import type { UploadProps } from 'antd/es/upload/interface';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getChallengePda,
  getCharityVaultPda,
  getConfigPda,
  getProgram,
  getTreasuryMemberPda,
  PROGRAM_ID,
  toSol,
} from '@/lib/program';

type View = 'challenges' | 'create' | 'complete' | 'expire' | 'admin';

const COMPLETION_BADGE_IMAGE_URI = 'https://aqua-junior-bobolink-189.mypinata.cloud/ipfs/bafybeiasp7opjsggxtjsdjtbf6e55kziqvhljgcx2vo6tpc4fccl5yj4ii';
type ChallengeRow = { publicKey: PublicKey; account: any };
type TreasuryMemberRow = { publicKey: PublicKey; account: any };

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

const nav: { id: View; label: string }[] = [
  { id: 'challenges', label: 'My challenges' },
  { id: 'create', label: 'Create' },
  { id: 'complete', label: 'Complete' },
  { id: 'expire', label: 'Expire' },
  { id: 'admin', label: 'Protocol' },
];

const short = (key?: PublicKey | null) => key ? `${key.toBase58().slice(0, 4)}…${key.toBase58().slice(-4)}` : 'Not connected';
const getDeadlineTimestamp = (deadline: any) => {
  if (deadline == null) return Number.POSITIVE_INFINITY;
  if (typeof deadline?.toNumber === 'function') return deadline.toNumber();
  return Number(deadline);
};
const statusName = (value: any, deadline?: any, now = Date.now() / 1000) => {
  if (value?.completed) return 'Completed';
  if (value?.active) return now > getDeadlineTimestamp(deadline) ? 'Expired' : 'Active';
  return 'Failed';
};
const parseError = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  if (/User rejected|rejected the request/i.test(text)) return 'Transaction cancelled in wallet.';
  return text.replace(/^.*Error: /, '').slice(0, 240);
};

const generateChallengeId = () => {
  const id = new BN(Array.from(crypto.getRandomValues(new Uint8Array(8))));
  return id.isZero() ? new BN(1) : id;
};

const createMemoInstruction = (details: Record<string, string | number | boolean>) => new TransactionInstruction({
  keys: [],
  programId: MEMO_PROGRAM_ID,
  data: Buffer.from(JSON.stringify(details), 'utf8'),
});

export function Dashboard() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [view, setView] = useState<View>('challenges');
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [vault, setVault] = useState<any>(null);
  const [treasuryMembers, setTreasuryMembers] = useState<TreasuryMemberRow[]>([]);
  const program = useMemo(() => wallet ? getProgram(connection, wallet) : null, [connection, wallet]);
  const isAuthority = Boolean(publicKey && config?.authority?.equals(publicKey));
  const isPrimaryTreasury = Boolean(publicKey && config?.treasury?.equals(publicKey));
  const isTreasuryMember = Boolean(publicKey && treasuryMembers.some(({ account }) => account.charityAuthority.equals(publicKey)));
  const canAccessProtocol = isAuthority || isPrimaryTreasury || isTreasuryMember;
  const balanceLabel = walletBalance === null
    ? '…'
    : (walletBalance / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 4 });

  const refresh = useCallback(async () => {
    if (!program || !publicKey) {
      setChallenges([]); setWalletBalance(null); setConfig(null); setVault(null); setTreasuryMembers([]); return;
    }
    setLoading(true);
    try {
      const [all, balance, configAccount, vaultAccount, memberAccounts] = await Promise.all([
        (program.account as any).challenge.all([
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ]),
        connection.getBalance(publicKey, 'confirmed'),
        (program.account as any).programConfig.fetchNullable(getConfigPda()),
        (program.account as any).charityVault.fetchNullable(getCharityVaultPda()),
        (program.account as any).treasuryMember.all(),
      ]);
      setChallenges(all.sort((a: ChallengeRow, b: ChallengeRow) => b.account.createdAt.cmp(a.account.createdAt)));
      setWalletBalance(balance);
      setConfig(configAccount); setVault(vaultAccount);
      setTreasuryMembers(memberAccounts);
    } catch (error) { toast.error(parseError(error)); }
    finally { setLoading(false); }
  }, [connection, program, publicKey]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (view === 'admin' && !canAccessProtocol) setView('challenges'); }, [canAccessProtocol, view]);

  const execute = async (label: string, make: () => Promise<{ transaction: Transaction; send: () => Promise<string>; signers?: Keypair[] }>) => {
    if (!wallet) return toast.error('Connect your wallet first.');
    const id = toast.loading(`Simulating ${label}…`);
    try {
      const { transaction, send, signers = [] } = await make();
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = blockhash;
      if (signers.length) transaction.partialSign(...signers);
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      toast.loading('Simulation passed. Confirm in your wallet…', { id });
      const signature = await send();
      toast.success(`${label} confirmed`, { id });
      await refresh();
      return signature;
    } catch (error) { toast.error(parseError(error), { id }); }
  };

  const copyWalletAddress = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      toast.success('Wallet address copied.');
    } catch {
      toast.error('Could not copy wallet address.');
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('challenges')}><span>TnD</span><strong>TalknDo</strong></button>
        <div className="network"><i /> Devnet · {publicKey ? <button className="wallet-address" type="button" onClick={copyWalletAddress} title="Copy wallet address">{short(publicKey)}</button> : short(publicKey)}{publicKey ? ` · ${balanceLabel} SOL` : ''}</div>
        {publicKey ? <span className="mobile-balance" aria-label={`Wallet balance: ${balanceLabel} SOL`}>{balanceLabel} SOL</span> : null}
        <WalletMultiButton />
      </header>

      <section className="hero">
        <p className="eyebrow">talk and do · On-chain accountability</p>
        <h1>Bet on Yourself</h1>
        <p>Stake SOL on a personal challenge. Complete it before the deadline to reclaim your stake and mint a permanent badge.</p>
      </section>

      <nav className="tabs" aria-label="Contract interactions">
        {nav.filter((item) => item.id !== 'admin' || canAccessProtocol).map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}
      </nav>

      <section className="workspace">
        {!publicKey ? <Empty title="Connect a wallet to begin" body="Phantom and Solflare are supported. The app is configured for Solana devnet." /> : null}
        {publicKey && view === 'challenges' ? <ChallengeList rows={challenges} loading={loading} onRefresh={refresh} onAction={setView} /> : null}
        {publicKey && view === 'create' && program ? <CreateChallenge program={program} publicKey={publicKey} execute={execute} /> : null}
        {publicKey && view === 'complete' && program ? <CompleteChallenge program={program} publicKey={publicKey} challenges={challenges} execute={execute} /> : null}
        {publicKey && view === 'expire' && program ? <ExpireChallenge program={program} challenges={challenges} execute={execute} /> : null}
        {publicKey && view === 'admin' && program && canAccessProtocol ? <Admin program={program} publicKey={publicKey} config={config} vault={vault} treasuryMembers={treasuryMembers} execute={execute} isAuthority={isAuthority} isPrimaryTreasury={isPrimaryTreasury} isTreasuryMember={isTreasuryMember} /> : null}
      </section>

      <footer><span>Program {short(PROGRAM_ID)}</span><a href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">View on Explorer ↗</a></footer>
    </main>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="empty"><div className="empty-mark">✦</div><h2>{title}</h2><p>{body}</p></div>;
}

function ChallengeList({ rows, loading, onRefresh, onAction }: { rows: ChallengeRow[]; loading: boolean; onRefresh: () => void; onAction: (v: View) => void }) {
  const now = Date.now() / 1000;
  const closestActive = rows
    .filter(({ account }) => statusName(account.status, account.deadline, now) === 'Active')
    .reduce<ChallengeRow | null>((closest, row) => !closest || row.account.deadline.lt(closest.account.deadline) ? row : closest, null);
  return <div>{closestActive ? <ChallengeCountdown title={closestActive.account.title} deadline={closestActive.account.deadline.toNumber()} /> : null}<div className="section-heading"><div><p className="eyebrow">Portfolio</p><h2>Your commitments</h2></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? <><span className="button-spinner" aria-hidden="true" />Refreshing…</> : 'Refresh'}</button></div>
    {!loading && !rows.length ? <Empty title="No challenges yet" body="Create your first commitment and put some SOL behind it." /> : <div className="challenge-grid">{rows.map(({ publicKey, account }) => {
      const status = statusName(account.status, account.deadline, now);
      return <article className="challenge-card" key={publicKey.toBase58()}><div className="card-top"><span className={`status ${status.toLowerCase()}`}>{status}</span><span>#{account.challengeId.toString()}</span></div><h3>{account.title}</h3><dl><div><dt>Stake</dt><dd>{toSol(account.stakeLamports)} SOL</dd></div><div><dt>Deadline</dt><dd>{new Date(account.deadline.toNumber() * 1000).toLocaleString()}</dd></div></dl><div className="card-actions">{status === 'Active' ? <button onClick={() => onAction('complete')}>Submit proof</button> : null}{status === 'Expired' ? <button onClick={() => onAction('expire')}>Expire</button> : null}<a href={`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">Account ↗</a></div></article>;
    })}</div>}
  </div>;
}

function ChallengeCountdown({ title, deadline }: { title: string; deadline: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline * 1000 - Date.now()));
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, deadline * 1000 - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const units = [
    { value: String(days).padStart(2, '0'), label: 'Days' },
    { value: String(hours).padStart(2, '0'), label: 'Hours' },
    { value: String(minutes).padStart(2, '0'), label: 'Minutes' },
    { value: String(secs).padStart(2, '0'), label: 'Seconds' },
  ];
  return <aside className="countdown-banner"><div className="countdown-challenge"><span>Closest active deadline</span><strong>{title}</strong></div><div className="digital-clock" aria-label={`${days} days, ${hours} hours, ${minutes} minutes, ${secs} seconds remaining`}>{units.map((unit, index) => <div className="clock-unit" key={unit.label}>{index ? <b aria-hidden="true">:</b> : null}<div><strong>{unit.value}</strong><small>{unit.label}</small></div></div>)}</div></aside>;
}

function CreateChallenge({ program, publicKey, execute }: any) {
  const [metadataUri, setMetadataUri] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const uploadProps: UploadProps = {
    beforeUpload: () => true,
    customRequest: async ({ file, onProgress, onSuccess, onError }) => {
      const uploadFile = file as File;
      setUploading(true);
      setUploadProgress(20);
      const id = toast.loading('Uploading details file…');
      try {
        const form = new FormData();
        form.set('file', uploadFile);
        const response = await fetch('/api/pinata/upload', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMetadataUri(result.url);
        setUploadProgress(100);
        onProgress?.({ percent: 100 });
        onSuccess?.(result as any, uploadFile as any);
        toast.success('Details file uploaded', { id });
      } catch (e) {
        setUploadProgress(0);
        onError?.(e as Error);
        toast.error(parseError(e), { id });
      } finally {
        setUploading(false);
      }
    },
    maxCount: 1,
    showUploadList: false,
    onRemove: () => {
      setMetadataUri('');
      setUploadProgress(0);
      return true;
    },
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    try {
      const data = new FormData(formElement);
      const id = generateChallengeId();
      const title = String(data.get('title')).trim();
      const metadataUriValue = String(data.get('metadataUri') ?? '').trim();
      const stake = new BN(Math.round(Number(data.get('stake')) * LAMPORTS_PER_SOL));
      const deadline = Math.floor(new Date(String(data.get('deadline'))).getTime() / 1000);
      const challenge = getChallengePda(publicKey, id);
      const memo = createMemoInstruction({
        type: 'talkndo:create_challenge',
        challengeId: id.toString(),
        creator: publicKey.toBase58(),
        title,
        metadataUri: metadataUriValue,
        deadline,
        stakeLamports: stake.toString(),
      });
      const builder = program.methods
        .initializeChallenge(id, title, metadataUriValue, new BN(deadline), stake)
        .accounts({ creator: publicKey, config: getConfigPda(), challenge, systemProgram: SystemProgram.programId })
        .postInstructions([memo]);
      const signature = await execute('Challenge created', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc() }));
      if (signature) {
        formElement.reset();
        setMetadataUri('');
        setUploadProgress(0);
      }
    } finally {
      setSubmitting(false);
    }
  };
  return <Interaction title="Create a challenge" subtitle="Your stake returns when you complete the challenge in time."><form onSubmit={submit} className="form"><Field label="Title" name="title" placeholder="Ship my first Solana app" maxLength={80} required /><small>Metadata URI (optional)</small><Upload {...uploadProps} className="upload-field" style={{ width: '100%' }}><label className="upload" style={{ width: '100%' }}><span>{uploading ? 'Uploading…' : metadataUri ? '✓ More details uploaded' : 'Upload more details file (optional)'}</span>{uploading || uploadProgress > 0 ? <Progress percent={uploadProgress} size="small" strokeColor={{ '0%': 'var(--green)', '100%': 'var(--lime)' }} trailColor="rgba(11,24,73,0.12)" /> : null}</label></Upload><input type="hidden" name="metadataUri" value={metadataUri} /><div className="form-row"><Field label="Stake (SOL)" name="stake" type="number" min="0.000000001" step="0.000000001" required /><Field label="Deadline" name="deadline" type="datetime-local" required /></div><button className="primary" type="submit" disabled={uploading || submitting}>{submitting ? <><span className="button-spinner" aria-hidden="true" />Creating…</> : 'Review & create challenge'}</button></form></Interaction>;
}

function CompleteChallenge({ program, publicKey, challenges, execute }: any) {
  const active = challenges.filter((x: ChallengeRow) => statusName(x.account.status, x.account.deadline) === 'Active');
  const [proofUri, setProofUri] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isSupportedProof = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      if (!isSupportedProof) {
        toast.error('Please upload a PDF, JPG, PNG, or WebP file.');
        return Upload.LIST_IGNORE;
      }
      return true;
    },
    customRequest: async ({ file, onProgress, onSuccess, onError }) => {
      const uploadFile = file as File;
      setUploading(true);
      setUploadProgress(20);
      const id = toast.loading('Uploading proof to IPFS…');
      try {
        const form = new FormData();
        form.set('file', uploadFile);
        const response = await fetch('/api/pinata/upload', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setProofUri(result.url);
        setUploadProgress(100);
        onProgress?.({ percent: 100 });
        onSuccess?.(result as any, uploadFile as any);
        toast.success('Proof pinned to IPFS', { id });
      } catch (e) {
        setUploadProgress(0);
        onError?.(e as Error);
        toast.error(parseError(e), { id });
      } finally {
        setUploading(false);
      }
    },
    maxCount: 1,
    accept: '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp',
    showUploadList: false,
    onRemove: () => {
      setProofUri('');
      setUploadProgress(0);
      return true;
    },
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    const id = toast.loading('Uploading metadata to IPFS…');
    try {
      const data = new FormData(formElement);
      const challenge = new PublicKey(String(data.get('challenge')));
      const badge = Keypair.generate();
      
      const selectedChallengeRow = active.find((r: ChallengeRow) => r.publicKey.toBase58() === challenge.toBase58());
      const title = selectedChallengeRow?.account.title || 'Challenge';
      const description = `Proof of completion for the Talk and Do challenge: ${title}. This permanent, non-transferable achievement badge confirms that the challenge was completed before its deadline.`;

      const metadataJson = {
        name: `Talk and Do: ${title}`,
        description,
        image: COMPLETION_BADGE_IMAGE_URI,
        attributes: [
          { trait_type: 'Achievement', value: 'Challenge completed' },
          { trait_type: 'Completed challenge', value: title },
        ],
        properties: {
          files: [
            {
              uri: COMPLETION_BADGE_IMAGE_URI,
              type: 'image/png',
            }
          ],
          category: "image"
        }
      };
      const jsonFile = new File([JSON.stringify(metadataJson)], 'metadata.json', { type: 'application/json' });
      const form = new FormData();
      form.set('file', jsonFile);
      const res = await fetch('/api/pinata/upload', { method: 'POST', body: form });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to upload metadata');
      const actualBadgeUri = result.url;
      toast.success('Metadata pinned to IPFS', { id });

      const memo = createMemoInstruction({ type: 'talkndo:complete_challenge', challenge: challenge.toBase58(), creator: publicKey.toBase58(), badgeAsset: badge.publicKey.toBase58() });
      const builder = program.methods.completeChallenge(proofUri, actualBadgeUri).accounts({ creator: publicKey, challenge, badgeAsset: badge.publicKey, systemProgram: SystemProgram.programId, mplCoreProgram: new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d') }).signers([badge]).postInstructions([memo]);
      const signature = await execute('Challenge completed', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc(), signers: [badge] }));
      if (signature) {
        formElement.reset();
        setProofUri('');
        setUploadProgress(0);
      }
    } catch (e) {
      toast.error(parseError(e), { id });
    } finally {
      setSubmitting(false);
    }
  };
  return <Interaction title="Submit proof" subtitle="Upload a document or photo as proof, then mint your non-transferable Metaplex Core badge."><form onSubmit={submit} className="form"><SelectChallenge rows={active} /><Upload {...uploadProps} className="upload-field" style={{ width: '100%' }}><label className="upload" style={{ width: '100%' }}><span>{uploading ? 'Uploading…' : proofUri ? '✓ Proof ready on IPFS' : 'Choose proof file or photo (max 10 MB)'}</span>{uploading || uploadProgress > 0 ? <Progress percent={uploadProgress} size="small" strokeColor={{ '0%': 'var(--green)', '100%': 'var(--lime)' }} trailColor="rgba(11,24,73,0.12)" /> : null}</label></Upload><input type="hidden" name="proofUri" value={proofUri} /><button className="primary" disabled={!active.length || uploading || !proofUri || submitting} type="submit">{submitting ? <><span className="button-spinner" aria-hidden="true" />Completing…</> : 'Review, reclaim stake & mint'}</button></form></Interaction>;
}

function ExpireChallenge({ program, challenges, execute }: any) {
  const expired = challenges.filter((x: ChallengeRow) => statusName(x.account.status, x.account.deadline) === 'Expired');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    try {
      const challenge = new PublicKey(String(new FormData(formElement).get('challenge')));
      const caller = program.provider.publicKey as PublicKey;
      const memo = createMemoInstruction({ type: 'talkndo:expire_challenge', challenge: challenge.toBase58(), caller: caller.toBase58() });
      const builder = program.methods.expireChallenge().accounts({ caller, config: getConfigPda(), charityVault: getCharityVaultPda(), challenge }).postInstructions([memo]);
      const signature = await execute('Challenge expired', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc() }));
      if (signature) {
        formElement.reset();
      }
    } finally {
      setSubmitting(false);
    }
  };
  return <Interaction title="Expire a challenge" subtitle="Anyone may settle an overdue active challenge. Its stake moves to the charity vault."><form onSubmit={submit} className="form"><SelectChallenge rows={expired} /><div className="notice">This action is irreversible. The challenge becomes failed and its stake is donated.</div><button className="danger" disabled={!expired.length || submitting} type="submit">{submitting ? <><span className="button-spinner" aria-hidden="true" />Expiring…</> : 'Review & expire challenge'}</button></form></Interaction>;
}

function Admin({ program, publicKey, config, vault, treasuryMembers, execute, isAuthority, isPrimaryTreasury, isTreasuryMember }: any) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const initialize = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPendingAction('initialize');
    try {
      const treasury = new PublicKey(String(new FormData(formElement).get('treasury')));
      const memo = createMemoInstruction({ type: 'talkndo:initialize_protocol', authority: publicKey.toBase58(), primaryTreasury: treasury.toBase58() });
      const builder = program.methods.initialize(treasury).accounts({ authority: publicKey, config: getConfigPda(), charityVault: getCharityVaultPda(), primaryTreasuryMember: getTreasuryMemberPda(treasury), systemProgram: SystemProgram.programId }).postInstructions([memo]);
      const signature = await execute('Protocol initialized', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc() }));
      if (signature) formElement.reset();
    } finally { setPendingAction(null); }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPendingAction('add');
    try {
      const member = new PublicKey(String(new FormData(formElement).get('member')));
      const memo = createMemoInstruction({ type: 'talkndo:add_treasury_member', primaryTreasury: publicKey.toBase58(), member: member.toBase58() });
      const builder = program.methods.addTreasuryMember(member).accounts({ primaryTreasuryAuthority: publicKey, config: getConfigPda(), treasuryMember: getTreasuryMemberPda(member), systemProgram: SystemProgram.programId }).postInstructions([memo]);
      const signature = await execute('Treasury member added', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc() }));
      if (signature) formElement.reset();
    } finally { setPendingAction(null); }
  };

  const removeMember = async (member: PublicKey) => {
    const action = `remove:${member.toBase58()}`;
    setPendingAction(action);
    try {
      const memo = createMemoInstruction({ type: 'talkndo:remove_treasury_member', primaryTreasury: publicKey.toBase58(), member: member.toBase58() });
      const builder = program.methods.removeTreasuryMember(member).accounts({ primaryTreasuryAuthority: publicKey, config: getConfigPda(), treasuryMember: getTreasuryMemberPda(member) }).postInstructions([memo]);
      await execute('Treasury member removed', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc() }));
    } finally { setPendingAction(null); }
  };

  const withdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPendingAction('withdraw');
    try {
      const data = new FormData(formElement);
      const recipient = new PublicKey(String(data.get('recipient')));
      const amount = new BN(Math.round(Number(data.get('amount')) * LAMPORTS_PER_SOL));
      const treasuryMember = getTreasuryMemberPda(publicKey);
      const bootstrapPrimaryMember = isPrimaryTreasury && !isTreasuryMember
        ? await program.methods.addTreasuryMember(publicKey).accounts({ primaryTreasuryAuthority: publicKey, config: getConfigPda(), treasuryMember, systemProgram: SystemProgram.programId }).instruction()
        : null;
      const memo = createMemoInstruction({ type: 'talkndo:withdraw_charity_funds', authority: publicKey.toBase58(), recipient: recipient.toBase58(), amountLamports: amount.toString(), activatedPrimaryMember: Boolean(bootstrapPrimaryMember) });
      let builder = program.methods.withdrawCharityFunds(amount).accounts({ charityAuthority: publicKey, config: getConfigPda(), treasuryMember, charityVault: getCharityVaultPda(), recipient }).postInstructions([memo]);
      if (bootstrapPrimaryMember) builder = builder.preInstructions([bootstrapPrimaryMember]);
      const signature = await execute('Charity funds sent', async () => ({ transaction: await builder.transaction(), send: () => builder.rpc() }));
      if (signature) {
        formElement.reset();
        setWithdrawOpen(false);
      }
    } finally { setPendingAction(null); }
  };

  const role = isPrimaryTreasury ? 'Primary treasury' : isTreasuryMember ? 'Treasury member' : isAuthority ? 'Protocol authority' : 'Viewer';
  const canWithdraw = Boolean(config && (isPrimaryTreasury || isTreasuryMember));
  return <>
    <div className={`admin-grid${isPrimaryTreasury ? '' : ' single'}`}>
      <Interaction title="Protocol state" subtitle="Configuration and charity accounting from devnet.">{config ? <><dl className="state-list"><div><dt>Authority</dt><dd>{short(config.authority)}</dd></div><div><dt>Primary treasury</dt><dd>{short(config.treasury)}</dd></div><div><dt>Authorized members</dt><dd>{treasuryMembers.length}</dd></div><div><dt>Total received</dt><dd>{toSol(vault?.totalReceived ?? 0)} SOL</dd></div><div><dt>Total withdrawn</dt><dd>{toSol(vault?.totalWithdrawn ?? 0)} SOL</dd></div></dl><small>Connected role: {role}</small>{canWithdraw ? <button className="primary protocol-withdraw" type="button" onClick={() => setWithdrawOpen(true)}>Withdraw funds</button> : null}</> : <form onSubmit={initialize} className="form"><div className="notice">The protocol has not been initialized on this cluster. This can only happen once.</div><Field label="Treasury wallet" name="treasury" placeholder="Solana address" required /><button className="primary" disabled={pendingAction !== null}>{pendingAction === 'initialize' ? <><span className="button-spinner" aria-hidden="true" />Initializing…</> : 'Initialize protocol'}</button></form>}</Interaction>
      {config && isPrimaryTreasury ? <Interaction title="Manage withdrawal access" subtitle="Add or revoke wallets that may distribute charity funds."><form onSubmit={addMember} className="form"><Field label="Wallet to authorize" name="member" placeholder="Solana address" required /><button className="primary" disabled={pendingAction !== null}>{pendingAction === 'add' ? <><span className="button-spinner" aria-hidden="true" />Adding…</> : 'Add treasury member'}</button></form><div className="member-list">{treasuryMembers.map(({ publicKey: memberPda, account }: TreasuryMemberRow) => { const member = account.charityAuthority as PublicKey; const isPrimary = member.equals(config.treasury); const removing = pendingAction === `remove:${member.toBase58()}`; return <div key={memberPda.toBase58()}><span title={member.toBase58()}>{short(member)}{isPrimary ? ' · Primary' : ''}</span>{!isPrimary ? <button className="danger" type="button" disabled={pendingAction !== null} onClick={() => removeMember(member)}>{removing ? <><span className="button-spinner" aria-hidden="true" />Removing…</> : 'Remove'}</button> : null}</div>; })}</div></Interaction> : null}
    </div>
    <Drawer title="Withdraw charity funds" placement="right" width="min(540px, 100vw)" open={withdrawOpen} closable={pendingAction !== 'withdraw'} maskClosable={pendingAction !== 'withdraw'} onClose={() => setWithdrawOpen(false)}>{isPrimaryTreasury && !isTreasuryMember ? <div className="notice">This protocol was initialized before withdrawal-member records were introduced. Your first withdrawal will authorize this existing primary treasury wallet and withdraw the funds together—no new wallet is added.</div> : null}<form onSubmit={withdraw} className="form drawer-form"><Field label="Recipient" name="recipient" placeholder="Solana address" required /><Field label="Amount (SOL)" name="amount" type="number" step="0.000000001" min="0.000000001" required /><button className="primary" disabled={pendingAction !== null}>{pendingAction === 'withdraw' ? <><span className="button-spinner" aria-hidden="true" />Withdrawing…</> : 'Review withdrawal'}</button></form></Drawer>
  </>;
}

function Interaction({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <article className="interaction"><h2>{title}</h2><p className="subtitle">{subtitle}</p>{children}</article>; }
function Field({ label, ...props }: any) { return <label className="field"><span>{label}</span><input {...props} /></label>; }
function SelectChallenge({ rows }: { rows: ChallengeRow[] }) { return <label className="field"><span>Challenge</span><select name="challenge" required disabled={!rows.length}><option value="">{rows.length ? 'Select a challenge' : 'No eligible challenges'}</option>{rows.map(({ publicKey, account }) => <option value={publicKey.toBase58()} key={publicKey.toBase58()}>{account.title} — #{account.challengeId.toString()}</option>)}</select></label>; }
