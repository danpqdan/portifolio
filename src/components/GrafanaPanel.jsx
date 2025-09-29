export default function GrafanaPanel({
  fullSrc,
  dashboardUid = 'adtkx5l',
  dashboardSlug = 'influx',
  panelId = 1,
  from = 'now-24h',
  to = 'now',
  orgId = 1,
  theme = 'light'
}) {
  const src = fullSrc
    ? fullSrc
    : `https://dsplayground.com.br/grafana/d-solo/${dashboardUid}/${dashboardSlug}?orgId=${orgId}&panelId=${panelId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&kiosk=tv&theme=${theme}`;
  return (
    <iframe
      src={src}
      width="100%"
      height="420"
      frameBorder="0"
      title={`Grafana panel ${dashboardUid}#${panelId}`}
    />
  );
}
