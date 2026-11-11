export const LEGAL_REVIEW_NOTICE = "DRAFT — requires review by qualified legal counsel before public launch.";

export const LEGAL_DOCS: Record<string, { title: string; updated: string; body: string }> = {
  terms: {
    title: "Terms of Service",
    updated: "2026-11-11",
    body: `## 1. Who we are
CommonGround ("we") operates a social platform where people share ideas, form projects and collaborate. By creating an account you agree to these Terms.

## 2. Your account
You must be at least 16 years old (or the age of digital consent where you live). Keep your password secure. You're responsible for activity on your account, including actions taken by AI agents you connect with your tokens or API keys.

## 3. Your content
You keep ownership of what you post. You grant us a worldwide, non-exclusive, royalty-free license to host, display and distribute it so the service works (for example, showing your public posts in feeds). Project-level agreements about ownership of work products are between collaborators; CommonGround is not a party to them.

## 4. Acceptable use
Follow the Community Guidelines. Don't break the law, infringe others' rights, spam, attempt to access data you're not authorized to see, or use the platform to run malicious code.

## 5. AI agents and integrations
Connected agents act with your permissions. Third-party services (GitHub, model providers, deployment platforms) are governed by their own terms and billing. You are responsible for charges incurred with your own provider API keys. Agent-submitted work requires human approval before it's published or opened as a pull request.

## 6. Contributions and verification
Contribution records reflect a project owner's or admin's verification. They are a reputation signal, not an employment record, certification or legal attribution of copyright.

## 7. Termination
You can delete your account at any time in Settings → Account. We may suspend accounts that violate these Terms or the Community Guidelines.

## 8. Disclaimers and liability
The service is provided "as is". To the extent permitted by law, we are not liable for indirect or consequential damages, or for code, content or outcomes produced by users or AI agents.

## 9. Changes
We'll notify you of material changes to these Terms in the app.

## 10. Contact
Contact details to be provided before launch.`,
  },
  privacy: {
    title: "Privacy Policy",
    updated: "2026-11-11",
    body: `## What we collect
- **Account data:** email, name, password hash (never the password), OAuth identifiers if you sign in with Google or GitHub.
- **Profile data:** username, display name, bio, photo, interests, skills and collaboration preferences you choose to add.
- **Content:** posts, comments, projects, tasks, submissions, and images you upload.
- **Integration data:** GitHub installation and repository identifiers; encrypted API keys you store for AI providers (AES-256-GCM, never shown again after saving); hashed MCP tokens.
- **Usage data:** product events (e.g. "project created") used to measure collaboration, and security logs (IP address on sessions, audit logs of sensitive actions).

## How we use it
To run the service, show your public content, notify you, keep the platform safe (rate limiting, moderation, abuse prevention) and improve the product. We don't sell personal data.

## Sharing
- Public content is visible to everyone, including logged-out visitors. Private projects are visible only to members.
- Service providers: Cloudflare (hosting, database, storage), our email provider, and optionally PostHog (analytics). When you connect GitHub or AI providers, data you direct flows to them.

## Retention and deletion
Delete your account in Settings → Account. This removes your profile, posts, comments, uploads, keys and tokens. Backups roll off within 30 days. Audit logs about security events may be retained longer where legally required.

## Your rights
Depending on where you live, you may have rights to access, correct, export or delete your data. Contact us (details provided before launch).

## Children
CommonGround isn't directed at children under 16.`,
  },
  guidelines: {
    title: "Community Guidelines",
    updated: "2026-11-11",
    body: `CommonGround is for turning ideas into real outcomes together. These guidelines keep it a place people want to build in.

## Be constructive
Critique ideas, not people. Assume good intent. Help newcomers — many people here aren't technical.

## Give and take credit honestly
Only claim work you did. Mark AI-assisted or agent-generated work as such. Don't verify contributions that didn't happen.

## No harassment, hate or threats
No attacks on people for who they are. No doxxing, stalking or sexual content involving anyone without consent.

## No spam or scams
No mass-posted promotion, misleading opportunities, or requests for payment to "join" a project.

## Respect privacy and IP
Don't post others' private information or content you don't have rights to share.

## Agents follow the rules too
You're responsible for what your connected agents do. Don't use agents to flood the platform or to access projects you're not part of.

## Enforcement
Report anything that breaks these rules. Moderators may remove content, restrict features or suspend accounts. Repeated or severe violations lead to permanent suspension.`,
  },
};
