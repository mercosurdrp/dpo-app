<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Deployar: `npm run deploy:prod`, nunca `vercel --prod` a mano

Este repo tiene ~60 worktrees y `vercel` sube **el directorio donde estás
parado**. El 04/08/2026 cuatro de esos árboles estaban congelados meses atrás
—`main` apuntaba 173 commits atrás y el árbol de trabajo era todavía más viejo—,
y deployar desde cualquiera de ellos hacía **retroceder producción** sin que
nada fallara: el código viejo compila igual. `/root/dpo-ruteo-sla` se llevaba
puestos 931 archivos y 168.869 líneas.

`scripts/check-arbol.mjs` compara el árbol contra `origin/main`:

```bash
npm run check-arbol     # ¿este árbol está al día? (baja origin/main)
npm run deploy          # preview, avisa si estás atrás
npm run deploy:prod     # producción: FRENA si no estás exactamente en origin/main
```

Corre también en `prebuild`, donde **falla** si estás en `main` o
`arbol-principal` desincronizadas, y sólo **avisa** en una rama de trabajo
(estar atrás ahí es normal). En el build remoto de Vercel se omite: no hay
`.git` y ése no es el lugar para frenar nada.

Si un árbol quedó viejo, se pone al día sin perder nada:

```bash
git stash push -m "pre-sync"     # sólo si hay cambios sin commitear
git merge --ff-only origin/main
```
<!-- END:nextjs-agent-rules -->
