// The delegated permissions the app asks for. Delegated means the app can never
// do more than the person signed in can already do themselves: Microsoft works
// out the intersection of what the app may ask for and what that person may see.
//
// Every scope below is marked "requiresAdminConsent: false" in Microsoft's own
// permissions dataset for the delegated (work or school) case, so in a tenant
// left on the default consent setting each person agrees to them at first
// sign-in and no administrator is involved. Only the application-only variants
// of these same scopes need an admin, and the app never uses those.
//
// User.Read            the signed-in person's own name, for "who moved this card"
// Mail.Read.Shared     read the shared mailbox they already open in Outlook
// Sites.ReadWrite.All  read and write the board list, the filing list and the job folders
// Files.ReadWrite.All  the document library and the Excel workbook calls. The plain
//                      Files.ReadWrite covers only the person's own OneDrive; the
//                      template lives in a SharePoint library, so the ".All" form
//                      ("all files the user can access") is the one that reaches it.
export const SCOPES = ['User.Read', 'Mail.Read.Shared', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'];

// Creating a list, and adding columns to one, is the one thing Sites.ReadWrite.All
// does not cover: Microsoft's reference gives Sites.Manage.All as the delegated
// permission for POST /sites/{id}/lists and for POST .../columns. It is only ever
// needed while the app is building its own site, so the setup screen asks for it
// separately and day-to-day use never does. It needs no admin consent either.
export const SETUP_SCOPES = [...SCOPES, 'Sites.Manage.All'];
