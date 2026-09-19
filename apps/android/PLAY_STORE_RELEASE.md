# Google Play release sheet

## Store listing

**App name** (30 characters maximum)

> Big Two Crew

**Default language**

> English (United Kingdom) or the developer account's preferred English locale

**Category**

> Game → Card

**Short description** (80 characters maximum)

> Play Big Two solo, pass-and-play with friends, or at private online tables.

**Full description**

> Take your seat at Big Two Crew, a polished take on the classic four-player Chinese card game.
>
> Play your way:
>
> • Challenge three computer opponents in solo play  
> • Pass one device around for a two-to-four-player local game  
> • Create a private online room and invite friends with a room code  
> • Ask for a hint when you need a fresh look at your hand
>
> Local games need no account and no connection. Sign in only when you want to create or join an
> online table.
>
> Big Two Crew uses no real-money wagering, prizes, or gambling mechanics.

**Contact details**

- Email: `alexchiu11@gmail.com`
- Website: `https://big-two.chiubaca.com`
- Privacy policy: `https://big-two.chiubaca.com/privacy`
- Account deletion URL: `https://big-two.chiubaca.com/account`

## Upload assets

- App icon: `store-assets/app-icon-512.png`
- Feature graphic: `store-assets/feature-graphic-1024x500.png`
- Phone screenshots: `store-assets/phone-screenshots/*.png`
- App bundle: `app-release-bundle.aab` (generated and ignored by Git)

## App content answers

- **Contains ads:** No
- **App access:** No special access is required for solo and pass-and-play. Reviewers can create an
  account from the sign-in panel if they need to test private online rooms.
- **Target audience:** 13 and older; the app is not directed to children under 13.
- **News app:** No
- **COVID-19 app:** No
- **Government app:** No
- **Financial features:** None
- **Real-money gambling:** No. The casino visual theme is decorative; the game has no wagering,
  prizes, purchases, or redeemable value.

Complete the content-rating questionnaire truthfully based on those behaviours.

## Data safety starting point

Confirm these answers against the production services and current Play Console wording before
submission.

- Data is encrypted in transit.
- Users can request deletion in the app and at the public account deletion URL.
- Account creation is optional and is used only for online multiplayer.
- Personal information collected for accounts: name, email address, username/user ID, and optional
  profile image.
- Authentication and security data: sign-in method, session cookie, IP address, and user agent.
- App activity: room membership and gameplay actions needed to run online matches.
- Diagnostics/analytics: basic usage, security, and reliability events processed by Cloudflare.
- Purposes: app functionality, account management, fraud/security prevention, analytics, and
  developer communications when a user contacts support.
- Service providers: Cloudflare for hosting, security, analytics, real-time rooms, and optional AI;
  Google only when the user chooses Google sign-in.
- Personal data is not sold and is not used for targeted advertising.

In Play's definition, processing by a contracted service provider may be excluded from “sharing.”
Use the current form's definitions rather than guessing.

## Release order

1. Create the Play Console app with package ID `com.chiubaca.bigtwocrew`.
2. Upload `app-release-bundle.aab` to **Internal testing** and enable Play App Signing.
3. Add Play's app-signing SHA-256 fingerprint to the web Digital Asset Links file as documented in
   `README.md`, then deploy the frontend again.
4. Finish Store listing, App content, Data safety, Content rating, and target-audience forms.
5. Add trusted testers and verify the installed test build opens without a browser toolbar.
6. Promote through closed/open testing as required by the developer account, then submit production
   for review.
