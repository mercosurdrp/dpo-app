/**
 * Crea el bucket 's5-auditorias' en Supabase Storage con las RLS policies
 * necesarias para subir fotos desde la UI (admin/auditor).
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/create-s5-bucket.ts
 *   (SUPABASE_URL se lee de NEXT_PUBLIC_SUPABASE_URL si está seteado)
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno."
  )
  process.exit(1)
}

const BUCKET = "s5-auditorias"

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Crear bucket si no existe (público para poder servir con getPublicUrl)
  const { data: buckets } = await admin.storage.listBuckets()
  const existe = buckets?.some((b) => b.name === BUCKET)

  if (existe) {
    console.log(`Bucket '${BUCKET}' ya existe.`)
  } else {
    const { error } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 15 * 1024 * 1024, // 15MB
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    })
    if (error) {
      console.error("Error creando bucket:", error.message)
      process.exit(1)
    }
    console.log(`Bucket '${BUCKET}' creado.`)
  }

  // 2. RLS para storage.objects — admin/auditor pueden leer/escribir/borrar
  //    en este bucket. El rol se chequea contra la tabla profiles.
  const policies = [
    {
      name: "s5_auditorias_select",
      sql: `
        CREATE POLICY "s5_auditorias_select" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = '${BUCKET}');
      `,
    },
    {
      name: "s5_auditorias_insert",
      sql: `
        CREATE POLICY "s5_auditorias_insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = '${BUCKET}'
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
        );
      `,
    },
    {
      name: "s5_auditorias_update",
      sql: `
        CREATE POLICY "s5_auditorias_update" ON storage.objects
        FOR UPDATE TO authenticated
        USING (
          bucket_id = '${BUCKET}'
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
        );
      `,
    },
    {
      name: "s5_auditorias_delete",
      sql: `
        CREATE POLICY "s5_auditorias_delete" ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = '${BUCKET}'
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
        );
      `,
    },
  ]

  for (const p of policies) {
    // Intentar borrar la policy previa si ya existía (idempotente)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any
    const drop = await adminAny.rpc("exec_sql", {
      sql: `DROP POLICY IF EXISTS "${p.name}" ON storage.objects;`,
    })
    if (drop.error) {
      console.log(
        `(info) DROP POLICY "${p.name}" devolvió:`,
        drop.error.message,
        " — Si el rpc 'exec_sql' no existe, aplicá las policies manualmente desde el SQL editor."
      )
      console.log("---- SQL pendiente ----")
      console.log(`DROP POLICY IF EXISTS "${p.name}" ON storage.objects;`)
      console.log(p.sql)
      continue
    }
    const created = await adminAny.rpc("exec_sql", { sql: p.sql })
    if (created.error) {
      console.log(`Policy "${p.name}" error:`, created.error.message)
    } else {
      console.log(`Policy "${p.name}" aplicada.`)
    }
  }

  console.log("\nListo. Si el RPC exec_sql no está disponible, ejecutá este SQL:")
  for (const p of policies) {
    console.log(`DROP POLICY IF EXISTS "${p.name}" ON storage.objects;`)
    console.log(p.sql)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
