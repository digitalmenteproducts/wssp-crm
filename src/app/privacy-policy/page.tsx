import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/layout/brand-logo";
import {
  APP_BRAND,
  APP_NAME,
  PRIVACY_CONTACT_EMAIL,
  ROUTES,
} from "@/config/app";

const LAST_UPDATED = "25 de agosto de 2026";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  "https://wssp-crm.vercel.app";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: `Política de Privacidad de ${APP_BRAND} / ${APP_NAME}: datos que procesamos, uso de WhatsApp Business Platform, inteligencia artificial, proveedores y cómo solicitar la eliminación de datos.`,
  alternates: {
    canonical: `${appUrl}${ROUTES.privacyPolicy}`,
  },
  openGraph: {
    title: `Política de Privacidad · ${APP_BRAND}`,
    description: `Cómo ${APP_BRAND} / ${APP_NAME} trata datos personales en el contexto de WhatsApp Business Platform.`,
    url: `${appUrl}${ROUTES.privacyPolicy}`,
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyPage() {
  const mailHref = `mailto:${PRIVACY_CONTACT_EMAIL}`;

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <header className="border-b border-outline-variant/40 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href={ROUTES.login}
            className="flex items-center gap-3 text-on-surface hover:opacity-90"
          >
            <BrandLogo size={36} className="rounded-lg" />
            <span className="font-heading text-base font-semibold tracking-tight">
              {APP_BRAND}
            </span>
          </Link>
          <Link
            href={ROUTES.login}
            className="text-sm font-medium text-primary hover:underline"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-xs tracking-wider text-secondary uppercase">
          Documento legal
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">
          Política de Privacidad
        </h1>
        <p className="mt-3 text-sm text-secondary">
          Última actualización: {LAST_UPDATED}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
          Esta Política describe cómo {APP_BRAND} (producto también conocido
          como {APP_NAME}) trata información en el marco de su plataforma SaaS
          para gestión de comunicaciones y marketing mediante WhatsApp Business
          Platform. Digitalmente CRM no pertenece a Meta Platforms, Inc., no
          está afiliado a Meta ni está respaldado por Meta o WhatsApp, salvo
          por la integración técnica con sus APIs públicas.
        </p>

        <article className="prose-legal mt-10 space-y-10 text-sm leading-relaxed text-on-surface">
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              1. Identidad del servicio
            </h2>
            <p>
              {APP_BRAND} / {APP_NAME} es una plataforma software como servicio
              (SaaS) multiempresa que permite a negocios gestionar conversaciones
              de WhatsApp, contactos, segmentos, plantillas, campañas y análisis
              asistidos por inteligencia artificial.
            </p>
            <p>
              Cada empresa cliente opera bajo un espacio aislado (
              <span className="font-mono text-xs">business_id</span>
              ). Los usuarios del SaaS son cuentas autorizadas de esas empresas.
              Las personas que escriben por WhatsApp a una empresa cliente son
              usuarios finales de esa empresa, no necesariamente usuarios
              registrados de Digitalmente CRM.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              2. Datos que podemos procesar
            </h2>
            <p>Según el uso del servicio, podemos procesar, entre otros:</p>
            <ul className="list-disc space-y-1.5 pl-5 text-on-surface-variant">
              <li>Nombre u otros identificadores de contacto.</li>
              <li>Número de teléfono (incluido el asociado a WhatsApp).</li>
              <li>
                Contenido de mensajes y conversaciones recibidos o enviados a
                través de WhatsApp Business Platform.
              </li>
              <li>
                Datos de contacto adicionales que la empresa cliente registre
                (estado comercial, notas, atributos).
              </li>
              <li>
                Información relacionada con campañas, plantillas y envíos
                autorizados.
              </li>
              <li>Etiquetas, segmentos y resultados de clasificación.</li>
              <li>
                Datos técnicos y de uso (por ejemplo, registros de acceso,
                eventos de aplicación, metadatos de mensajes e identificadores
                técnicos).
              </li>
              <li>
                Identificadores necesarios para la integración con WhatsApp
                Business (como Phone Number ID, WhatsApp Business Account ID y
                tokens de acceso gestionados por la empresa cliente).
              </li>
              <li>
                Datos de cuenta de usuarios del SaaS (correo electrónico, nombre
                de perfil y membresía en una empresa).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              3. Cómo obtenemos los datos
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-on-surface-variant">
              <li>
                Directamente de usuarios del SaaS al registrarse, iniciar sesión
                o configurar su cuenta e integraciones.
              </li>
              <li>
                A través de empresas clientes que utilizan la plataforma para
                gestionar su comunicación comercial.
              </li>
              <li>
                Mediante WhatsApp Business Platform / Meta (por ejemplo, APIs y
                webhooks que entregan mensajes y eventos a nuestro backend).
              </li>
              <li>
                Por el uso normal del servicio (navegación, acciones en el
                panel, campañas y herramientas de segmentación).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">4. Finalidades</h2>
            <p>Tratamos la información para:</p>
            <ul className="list-disc space-y-1.5 pl-5 text-on-surface-variant">
              <li>Prestar y mantener el servicio SaaS.</li>
              <li>Gestionar conversaciones y bandejas de WhatsApp.</li>
              <li>Organizar contactos y su historial.</li>
              <li>Segmentar audiencias según reglas definidas por el cliente.</li>
              <li>
                Realizar análisis y clasificación asistidos por IA (resúmenes,
                etiquetas, señales comerciales).
              </li>
              <li>
                Permitir campañas y envíos de plantillas cuando el cliente los
                autorice y configure.
              </li>
              <li>
                Mejorar la seguridad, el rendimiento y la fiabilidad del
                sistema.
              </li>
              <li>Prestar soporte técnico y resolver incidencias.</li>
              <li>
                Cumplir obligaciones legales aplicables y responder a
                requerimientos legítimos de autoridades cuando corresponda.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              5. Uso de WhatsApp / Meta
            </h2>
            <p>
              Digitalmente CRM integra WhatsApp Business Platform (Cloud API) de
              Meta para que las empresas clientes puedan recibir y enviar
              mensajes. Parte de los datos (mensajes, metadatos e
              identificadores de negocio) se reciben o envían mediante las APIs
              y webhooks de Meta.
            </p>
            <p>
              El uso de WhatsApp también está sujeto a las políticas, términos y
              condiciones de Meta / WhatsApp. Recomendamos revisar la
              documentación y políticas oficiales de Meta. Digitalmente CRM no
              controla el tratamiento que Meta realiza de forma independiente
              como proveedor de la plataforma de mensajería.
            </p>
            <p>
              Digitalmente CRM / {APP_NAME} no es un producto de Meta, no forma
              parte de Meta Platforms, Inc. y no está respaldado ni
              patrocinado por Meta o WhatsApp.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              6. Inteligencia artificial
            </h2>
            <p>
              Determinadas conversaciones y metadatos asociados pueden
              procesarse mediante servicios de inteligencia artificial —
              actualmente OpenAI — para ayudar a clasificar conversaciones,
              generar resúmenes y apoyar la segmentación comercial.
            </p>
            <p>
              Estas funciones están diseñadas como asistencia operativa para el
              negocio cliente. No están un sistema automatizado destinado a tomar
              por sí solo decisiones legales, crediticias, de empleo u otras
              decisiones de alto impacto sobre personas. El cliente es
              responsable de cómo interpreta y actúa sobre los resultados de la
              IA.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              7. Proveedores y subencargados
            </h2>
            <p>
              Para operar el servicio podemos recurrir a proveedores
              tecnológicos, entre ellos de forma general:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-on-surface-variant">
              <li>Meta / WhatsApp (mensajería e integración Business).</li>
              <li>OpenAI (procesamiento de análisis y clasificación).</li>
              <li>Supabase (autenticación y base de datos).</li>
              <li>Vercel (hosting y ejecución del backend/aplicación).</li>
              <li>
                Otros proveedores estrictamente necesarios para seguridad,
                correo, monitorización o infraestructura.
              </li>
            </ul>
            <p>
              Estos proveedores solo deben tratar datos en la medida necesaria
              para prestar sus servicios. Cada uno aplica sus propias políticas
              de privacidad.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              8. Conservación
            </h2>
            <p>
              Conservamos la información durante el tiempo necesario para
              prestar el servicio, cumplir obligaciones legales, resolver
              disputas e incidencias técnicas, y mantener la seguridad del
              sistema.
            </p>
            <p>
              Cuando una empresa cliente cancela el servicio o solicita la
              eliminación de su espacio, procederemos a eliminar o anonimizar
              los datos asociados, sujeto a plazos técnicos razonables y a
              retenciones legales o de seguridad que puedan aplicar.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">9. Seguridad</h2>
            <p>
              Aplicamos medidas razonables de seguridad organizativas y técnicas
              acordes a la naturaleza del servicio, incluyendo controles de
              acceso, aislamiento multiempresa por{" "}
              <span className="font-mono text-xs">business_id</span>, uso de
              conexiones cifradas en tránsito cuando corresponde, y
              almacenamiento en infraestructuras de proveedores especializados.
            </p>
            <p>
              Ningún sistema es completamente seguro. No podemos garantizar la
              seguridad absoluta frente a todos los riesgos, pero trabajamos
              para reducirlos y responder ante incidentes de forma diligente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              10. Derechos del usuario
            </h2>
            <p>
              Según la legislación aplicable, usted puede tener derecho a
              solicitar acceso, rectificación, eliminación, oposición o
              limitación del tratamiento de sus datos personales, así como
              otras facultades que reconozca la normativa local.
            </p>
            <p>
              Si usted es un usuario final que se comunica por WhatsApp con una
              empresa cliente de Digitalmente CRM, esa empresa suele ser el
              primer responsable del trato comercial de su conversación. En
              muchos casos, las solicitudes deben dirigirse primero a esa
              empresa. También puede contactarnos en{" "}
              <a
                href={mailHref}
                className="font-medium text-primary hover:underline"
              >
                {PRIVACY_CONTACT_EMAIL}
              </a>{" "}
              y le ayudaremos a orientar la solicitud cuando sea posible.
            </p>
          </section>

          <section className="space-y-3" id="eliminacion-de-datos">
            <h2 className="font-heading text-xl font-semibold">
              11. Solicitud de eliminación de datos
            </h2>
            <p>
              Para solicitar la eliminación de datos personales tratados por
              Digitalmente CRM / {APP_NAME}, envíe un correo a:
            </p>
            <p>
              <a
                href={mailHref}
                className="font-medium text-primary hover:underline"
              >
                {PRIVACY_CONTACT_EMAIL}
              </a>
            </p>
            <p>En la medida de lo posible, incluya:</p>
            <ul className="list-disc space-y-1.5 pl-5 text-on-surface-variant">
              <li>Su nombre y un medio de contacto.</li>
              <li>
                El número de teléfono de WhatsApp involucrado (si aplica).
              </li>
              <li>
                El nombre de la empresa o negocio con el que interactuó (si lo
                conoce).
              </li>
              <li>Una descripción clara de la solicitud de eliminación.</li>
            </ul>
            <p>
              Verificaremos la solicitud de forma razonable y procederemos a la
              eliminación o a la coordinación con la empresa cliente cuando el
              dato esté bajo su control operativo, salvo que debamos conservar
              cierta información por motivos legales, de seguridad o de
              resolución de disputas.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              12. Transferencias internacionales
            </h2>
            <p>
              Algunos de nuestros proveedores tecnológicos pueden procesar
              información en países distintos al de residencia del usuario o de
              la empresa cliente. Al utilizar el servicio, usted entiende que
              los datos pueden tratarse en esas infraestructuras globales
              conforme a las prácticas de cada proveedor y a las salvaguardas
              que estos ofrezcan.
            </p>
            <p>
              No afirmamos aquí un régimen legal concreto de transferencia para
              todas las jurisdicciones; evaluamos y actualizamos nuestras
              prácticas según evolucione el producto y la normativa aplicable.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">13. Menores</h2>
            <p>
              El servicio está orientado a usos empresariales y comerciales. No
              está dirigido intencionalmente a menores de edad. Si cree que
              hemos recibido información de un menor de forma indebida,
              contáctenos para que podamos revisarlo y, cuando corresponda,
              eliminarla.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">
              14. Cambios a esta política
            </h2>
            <p>
              Podemos actualizar esta Política de Privacidad para reflejar
              cambios en el servicio, en proveedores o en requisitos legales.
              Publicaremos la versión vigente en esta misma URL e indicaremos la
              fecha de última actualización. El uso continuado del servicio tras
              un cambio material implica la toma de conocimiento de la nueva
              versión, sin perjuicio de derechos que la ley le reserve.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">15. Contacto</h2>
            <p>
              Para consultas sobre privacidad, ejercicio de derechos o
              solicitudes relacionadas con esta política:
            </p>
            <p>
              <a
                href={mailHref}
                className="font-medium text-primary hover:underline"
              >
                {PRIVACY_CONTACT_EMAIL}
              </a>
            </p>
            <p className="text-on-surface-variant">
              Servicio: {APP_BRAND} / {APP_NAME}
              <br />
              Sitio:{" "}
              <a
                href={appUrl}
                className="font-medium text-primary hover:underline"
              >
                {appUrl}
              </a>
            </p>
          </section>
        </article>
      </main>

      <footer className="border-t border-outline-variant/40 py-6 text-center">
        <p className="font-mono text-xs tracking-wide text-outline">
          © {new Date().getFullYear()} {APP_BRAND} / {APP_NAME}. Todos los
          derechos reservados.
        </p>
      </footer>
    </div>
  );
}
