'use client';
import dynamic from 'next/dynamic';
const Demo = dynamic(() => import('@zk-auth/demo/client').then((m) => m.Demo), {
  ssr: false,
  loading: () => <p>Loading private proof tools…</p>,
});
export default function Page() {
  return <Demo appId="demo-a" title="Student Lab" accent="#86efac" />;
}
