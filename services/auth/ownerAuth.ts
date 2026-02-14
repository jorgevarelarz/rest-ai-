interface SessionResponse {
  authenticated: boolean;
  username?: string;
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function ownerSession(): Promise<SessionResponse> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return { authenticated: false };
    const body = await parseJson<SessionResponse>(res);
    return body ?? { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export async function ownerLogin(username: string, password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return false;
    const body = await parseJson<SessionResponse>(res);
    return Boolean(body?.authenticated);
  } catch {
    return false;
  }
}

export async function ownerLogout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // no-op
  }
}
