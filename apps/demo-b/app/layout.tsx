import '../../demo-a/app/style.css';
export const metadata = {
  title: 'ProofPass · Campus Library',
  description: 'Independent application authentication demo',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
