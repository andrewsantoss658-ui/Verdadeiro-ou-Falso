# Especificação de Segurança Sentinel AI

## 1. Documentos e Invariantes

| Coleção | Invariante de Segurança |
| :--- | :--- |
| `users` | Apenas o próprio usuário pode ler seu perfil privado. Apenas admins podem alterar roles ou saldo. |
| `verifications` | Usuários podem criar análises e ler as suas. Anonimos podem ver análises públicas se o ID for conhecido? Não, limitaremos a leitura ao dono. |
| `viral_trends` | Leitura pública (global). Escrita restrita apenas a Admins. |
| `known_fakes` | Leitura pública. Escrita restrita apenas a Admins. |

## 2. As "Doze Sujas" (Payloads de Ataque)

Esses payloads devem ser REJEITADOS pelas regras.

1.  **Identity Spoofing:** Criar perfil com UID de outro usuário.
2.  **Privilege Escalation:** Usuário comum tentando definir `isAdmin: true` no próprio perfil.
3.  **Economy Hack:** Usuário tentando aumentar seu `balance` manualmente.
4.  **Shadow Update:** Injetar campo `verifiedByAdmin: true` em uma verificação.
5.  **PII Leak:** Usuário A tentando ler o documento de usuário B em `/users/{uid}`.
6.  **Trend Poisoning:** Usuário comum tentando deletar ou editar uma tendência em `/viral_trends`.
7.  **Resource Exhaustion:** Enviar um título de 1MB para uma verificação.
8.  **ID Poisoning:** Tentar criar um documento com ID de 2KB de caracteres lixo.
9.  **Relational Sync Break:** Criar uma verificação vinculada a um `projectId` (ou userId) inexistente.
10. **State Lock Bypass:** Tentar alterar o `result` de uma verificação que já foi concluída há 1 mês (Imutabilidade).
11. **Timestamp Spoofing:** Enviar `createdAt` do passado para burlar logs.
12. **Blanket Query Scraping:** Tentar listar TODAS as verificações sem filtro de `userId`.

## 3. Test Runner (Draft)

Arquivo de teste simulado `firestore.rules.test.ts` para validar as negações.

```typescript
// Exemplo de teste para Identity Spoofing
it("should deny user from creating profile with different UID", async () => {
  const db = setupDb({ uid: "user_a" });
  const doc = db.collection("users").doc("user_b");
  await assertFails(doc.set({ email: "hacker@evil.com", isAdmin: false }));
});
```
