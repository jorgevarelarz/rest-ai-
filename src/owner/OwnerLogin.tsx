import React, { useState } from "react";

interface OwnerLoginProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
}

const OwnerLogin: React.FC<OwnerLoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    const ok = await onLogin(username.trim(), password);
    setIsLoading(false);
    if (!ok) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    setError("");
    setPassword("");
  };

  return (
    <div className="h-full w-full bg-gray-100 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl shadow-md border border-gray-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Acceso restaurante</h1>
          <p className="text-sm text-gray-500">Inicia sesión para abrir el panel de gestión.</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Usuario</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
            autoComplete="username"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
            autoComplete="current-password"
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full rounded-md py-2.5 text-sm font-semibold transition ${
            isLoading ? "bg-gray-500 text-white cursor-not-allowed" : "bg-gray-900 text-white hover:bg-black"
          }`}
        >
          {isLoading ? "Validando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
};

export default OwnerLogin;
