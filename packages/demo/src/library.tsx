'use client';
import { useEffect, useState } from 'react';
type Material = { id: string; title: string; filename: string; format: string; bytes: number };
export function Library({ authenticated }: { authenticated: boolean }) {
  const [materials, setMaterials] = useState<Material[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    setMaterials(undefined);
    setError('');
    if (!authenticated) return;
    const controller = new AbortController();
    void fetch('/api/library', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? 'Your session has ended. Sign out and verify again to access the library.'
              : 'Materials are temporarily unavailable. Please try again.',
          );
        const data = await response.json();
        setMaterials(data.materials);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [authenticated]);
  return (
    <section className="library-section" aria-labelledby="library-title">
      <div className="library-heading">
        <div>
          <p className="section-label">Campus Library / Course materials</p>
          <h2 id="library-title">Your reading shelf</h2>
        </div>
        <span className="library-access">
          {authenticated ? 'Session access' : 'Sign-in required'}
        </span>
      </div>
      {!authenticated ? (
        <div className="library-locked">
          <span aria-hidden="true">03</span>
          <div>
            <h3>Three course materials are ready.</h3>
            <p>Verify your access above to read the PDF and download the presentation slides.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="library-description">
            Open the PDF in your browser or save a copy. Presentation files download for use in
            PowerPoint or another slide reader.
          </p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {!materials && !error && <p className="library-loading">Loading your materials…</p>}
          <div className="material-list">
            {materials?.map((material, index) => (
              <article className="material-row" key={material.id}>
                <span className="material-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="material-info">
                  <span className="material-meta">
                    {material.format} · {(material.bytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <h3>{material.title}</h3>
                  <p>{material.filename}</p>
                </div>
                <div className="material-actions">
                  {material.format === 'PDF' && (
                    <a
                      href={`/api/library/${material.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read PDF ↗
                    </a>
                  )}
                  <a href={`/api/library/${material.id}?download=1`}>Download {material.format}</a>
                </div>
              </article>
            ))}
          </div>
          <p className="library-footnote">
            Each file request checks your Campus Library session. Signing out prevents new
            downloads; copies already saved to your device remain available.
          </p>
        </>
      )}
    </section>
  );
}
