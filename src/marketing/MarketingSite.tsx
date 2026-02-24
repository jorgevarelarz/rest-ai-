import React, { useMemo, useState } from "react";
import { SITE_CONFIG } from "./siteConfig";

interface MarketingSiteProps {
  onOpenDemo: () => void;
}

type LeadForm = {
  name: string;
  business: string;
  email: string;
  phone: string;
  vertical: "hospitality" | "professional_services";
  message: string;
};

const emptyForm: LeadForm = {
  name: "",
  business: "",
  email: "",
  phone: "",
  vertical: "hospitality",
  message: "",
};

const cardBase = "rounded-2xl border border-slate-200 bg-white shadow-sm";

const MarketingSite: React.FC<MarketingSiteProps> = ({ onOpenDemo }) => {
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [sent, setSent] = useState(false);

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent(`Nueva consulta comercial - ${form.business || "Sin negocio"}`);
    const body = encodeURIComponent(
      [
        `Nombre: ${form.name || "-"}`,
        `Negocio: ${form.business || "-"}`,
        `Email: ${form.email || "-"}`,
        `Teléfono: ${form.phone || "-"}`,
        `Vertical: ${form.vertical === "hospitality" ? "Hostelería" : "Servicios profesionales"}`,
        "",
        "Mensaje:",
        form.message || "-",
      ].join("\n")
    );
    return `mailto:${SITE_CONFIG.salesEmail}?subject=${subject}&body=${body}`;
  }, [form]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = mailtoHref;
    setSent(true);
  };

  return (
    <div
      className="h-screen w-full overflow-y-auto text-slate-900"
      style={{
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
        fontFamily: '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif',
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={SITE_CONFIG.mark} alt={`${SITE_CONFIG.brandName} mark`} className="h-10 w-10 rounded-xl" />
            <div>
              <div className="text-sm uppercase tracking-[0.22em] text-slate-500">{SITE_CONFIG.brandName}</div>
              <div className="text-xs text-slate-600">{SITE_CONFIG.heroTagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`mailto:${SITE_CONFIG.salesEmail}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Contactar ventas
            </a>
            <button
              onClick={onOpenDemo}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition"
              style={{ backgroundColor: SITE_CONFIG.colors.navy }}
            >
              Ver demo
            </button>
          </div>
        </header>

        <main className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className={`${cardBase} p-6 sm:p-10`}>
            <p className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              Plataforma de atención automatizada por WhatsApp
            </p>
            <div className="mt-5">
              <img src={SITE_CONFIG.logo} alt={`${SITE_CONFIG.brandName} logo`} className="h-11 w-auto" />
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
              Profesionaliza tu captación de citas y reservas sin ampliar equipo.
            </h1>
            <p className="mt-5 max-w-2xl text-sm text-slate-700 sm:text-base">
              {SITE_CONFIG.brandName} atiende conversaciones entrantes, recoge datos clave, confirma disponibilidad,
              agenda, modifica y cancela. Diseñado para negocios con alta carga operativa.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xl font-bold text-slate-900">24/7</div>
                <div className="text-xs text-slate-600">Atención continua sin esperas</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xl font-bold text-slate-900">1 panel</div>
                <div className="text-xs text-slate-600">Control centralizado por negocio</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xl font-bold text-slate-900">Sync</div>
                <div className="text-xs text-slate-600">Integración con Google Calendar</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1">Hostelería</span>
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1">Clínicas</span>
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1">Despachos</span>
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1">Asesorías</span>
              <span className="rounded-full border border-slate-300 bg-white px-3 py-1">Centros de estética</span>
            </div>
          </section>

          <section className={`${cardBase} p-6 sm:p-8`}>
            <h2 className="text-xl font-bold">Solicitar información</h2>
            <p className="mt-1 text-xs text-slate-600">Recibe una propuesta adaptada a tu volumen y sector.</p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Tu nombre"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <input
                required
                value={form.business}
                onChange={(e) => setForm((p) => ({ ...p, business: e.target.value }))}
                placeholder="Nombre del negocio"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <input
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Teléfono"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <select
                value={form.vertical}
                onChange={(e) => setForm((p) => ({ ...p, vertical: e.target.value as LeadForm["vertical"] }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option value="hospitality">Hostelería</option>
                <option value="professional_services">Servicios profesionales</option>
              </select>
              <textarea
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                placeholder="Cuéntanos tu caso (volumen, horarios, equipo...)"
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <button
                type="submit"
                className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-white transition"
                style={{ backgroundColor: SITE_CONFIG.colors.navy }}
              >
                Solicitar propuesta
              </button>
            </form>
            {sent ? <p className="mt-3 text-xs font-semibold text-emerald-700">Consulta lista. Se abrió tu cliente de correo.</p> : null}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              También puedes escribir directamente a <span className="font-semibold">{SITE_CONFIG.salesEmail}</span>
            </div>
          </section>
        </main>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className={`${cardBase} p-6`}>
            <h3 className="text-lg font-bold">Versiones por sector</h3>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Hostelería</div>
                <ul className="mt-2 space-y-1 text-sm text-slate-800">
                  <li>Reservas por fecha/hora</li>
                  <li>Control de mesas y estados</li>
                  <li>Asignación automática</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Servicios profesionales</div>
                <ul className="mt-2 space-y-1 text-sm text-slate-800">
                  <li>Agenda de citas</li>
                  <li>Cambio/cancelación guiada</li>
                  <li>Seguimiento operativo diario</li>
                </ul>
              </div>
            </div>
          </div>

          <div className={`${cardBase} p-6`}>
            <h3 className="text-lg font-bold">Planes orientativos</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
                <span>Starter (1 negocio)</span>
                <span className="font-bold">{SITE_CONFIG.plans.starter}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
                <span>Growth (hasta 5 negocios)</span>
                <span className="font-bold">{SITE_CONFIG.plans.growth}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
                <span>Partner (agencias/multi-sede)</span>
                <span className="font-bold">{SITE_CONFIG.plans.partner}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Incluye configuración inicial y soporte de implantación.</p>
          </div>

          <div className={`${cardBase} p-6`}>
            <h3 className="text-lg font-bold">Implantación</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">1. Diagnóstico</div>
                <div className="text-xs">Analizamos flujo actual y casuística de tu negocio.</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">2. Configuración</div>
                <div className="text-xs">Personalizamos mensajes, reglas y horarios operativos.</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">3. Puesta en marcha</div>
                <div className="text-xs">Activamos el bot y monitorizamos resultados iniciales.</div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${cardBase} mt-6 p-6`}>
          <h3 className="text-lg font-bold">Preguntas frecuentes</h3>
          <div className="mt-3 space-y-2 text-sm">
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-semibold">¿Necesito cambiar de número de WhatsApp?</summary>
              <p className="mt-2 text-slate-700">No. Podemos configurar el bot sobre tu canal actual.</p>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-semibold">¿Se sincroniza con Google Calendar?</summary>
              <p className="mt-2 text-slate-700">Sí. Altas, cambios y cancelaciones se reflejan automáticamente.</p>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-semibold">¿Cuánto tarda la implantación?</summary>
              <p className="mt-2 text-slate-700">Suele completarse entre 24 y 72 horas según complejidad.</p>
            </details>
          </div>
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-600">
          <span>
            {SITE_CONFIG.brandName} · Automatización de reservas y citas por WhatsApp · {SITE_CONFIG.salesEmail}
          </span>
          <button
            onClick={onOpenDemo}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100"
          >
            Abrir demo del producto
          </button>
        </footer>
      </div>
    </div>
  );
};

export default MarketingSite;
