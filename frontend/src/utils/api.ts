const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function request(method: string, endpoint: string, body?: any, isMultipart = false) {
  // Check token in localStorage (if client-side)
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: HeadersInit = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!isMultipart && method !== "GET" && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    options.body = isMultipart ? body : JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, options);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(errorData.detail || "Request failed");
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export function getFullDownloadUrl(downloadUrl: string): string {
  const backendBase = BASE_URL.replace("/api", "");
  return `${backendBase}${downloadUrl}`;
}
