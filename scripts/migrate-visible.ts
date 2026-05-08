import { createClient } from "@supabase/supabase-js"

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Try to select visible to check if it exists
  const { error: checkError } = await sb
    .from("capacitaciones")
    .select("visible")
    .limit(1)

  if (checkError && checkError.code === "42703") {
    console.log("Column 'visible' does not exist. Creating via RPC...")
    // We need to create a temp function to run DDL
    // Alternative: just add it as a default in the app layer
    console.log("Cannot run DDL via REST API. Please run this SQL in Supabase Dashboard:")
    console.log("")
    console.log("  ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT false;")
    console.log("")
    process.exit(1)
  } else {
    console.log("Column 'visible' already exists!")
  }
}

main()
