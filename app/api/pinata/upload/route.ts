import { NextResponse } from 'next/server';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) return NextResponse.json({ error: 'PINATA_JWT is not configured.' }, { status: 500 });

    const input = await request.formData();
    const file = input.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file first.' }, { status: 400 });
    if (!['application/pdf', 'application/json', 'image/svg+xml'].includes(file.type)) return NextResponse.json({ error: 'Unsupported file type.' }, { status: 415 });
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'File must be 10 MB or smaller.' }, { status: 413 });

    const payload = new FormData();
    payload.set('file', file, file.name);
    payload.set('pinataMetadata', JSON.stringify({ name: file.name }));
    const response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: payload,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message ?? result?.error ?? 'Pinata upload failed.');

    const cid = result.data?.cid ?? result.IpfsHash;
    if (!cid) throw new Error('Pinata did not return a CID.');
    const gateway = (process.env.PINATA_GATEWAY_URL ?? 'https://gateway.pinata.cloud').replace(/\/$/, '');
    return NextResponse.json({ cid, url: `${gateway}/ipfs/${cid}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
}
