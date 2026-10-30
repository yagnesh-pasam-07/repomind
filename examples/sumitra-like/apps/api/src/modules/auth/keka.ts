// Pull employee master data from Keka during migration.
export async function fetchEmployees() {
  const r = await fetch('https://sumitra.keka.com/api/v1/hris/employees', { headers: { Authorization: `Bearer ${process.env.KEKA_API_TOKEN}` } });
  return r.json();
}
