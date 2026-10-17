'use client';
import dynamic from 'next/dynamic';
const Demo = dynamic(() => import('@zk-auth/demo/client').then((m) => m.Demo), {
  ssr: false,
  loading: () => <p>Loading private proof tools…</p>,
});
export default function Page() {
  return <Demo appId="demo-b" title="Campus Library" accent="#c4b5fd" />;
}
