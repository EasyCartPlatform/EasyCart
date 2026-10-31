// Calls GitHub with the job token and rejects failed API responses without exposing credentials.
export async function github_api(path, options = {}) {
  const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...options.headers }
  });
  if (!response.ok) throw new Error(`GitHub API failed (${response.status})`);
  return response.json();
}
