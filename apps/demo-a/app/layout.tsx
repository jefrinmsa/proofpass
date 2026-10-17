import './style.css';
export const metadata = {
  title: 'ProofPass · Student Lab',
  description: 'Private test Aadhaar authentication demo',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
