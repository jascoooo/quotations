// The delegated permissions the app asks for. Delegated means the app can never
// do more than the person signed in can already do themselves.
//
// User.Read          – the signed-in person's own name, for "who moved this card"
// Mail.Read.Shared   – read the shared mailbox the person already opens in Outlook
// Sites.ReadWrite.All– the quotes site: the board list, the filing list, job folders
// Files.ReadWrite    – the least-privileged scope Microsoft documents for the
//                      document library and the Excel workbook calls
//
// None of these is marked "admin consent required" in Microsoft's Graph permissions
// reference, so in a tenant left on the default consent setting each person can
// agree to them at first sign-in. A tenant that has tightened user consent will
// show "Need admin approval" instead; see docs/setup.md.
export const SCOPES = ['User.Read', 'Mail.Read.Shared', 'Sites.ReadWrite.All', 'Files.ReadWrite'];
