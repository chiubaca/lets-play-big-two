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
- **App access:** Solo and pass-and-play require no account. Dedicated reviewer credentials and
  online-room instructions are saved in Play Console; the secret remains only in the ignored local
  `.play-review.env` file.
- **Target audience:** 13 and older; the app is not directed to children under 13.
- **News app:** No
- **COVID-19 app:** No
- **Government app:** No
- **Financial features:** None
- **Real-money gambling:** No. The casino visual theme is decorative; the game has no wagering,
  prizes, purchases, or redeemable value.

Complete the content-rating questionnaire truthfully based on those behaviours.

## Data safety declaration

The following answers are saved in Play Console and staged for review:

- **Collects or shares required data types:** Yes.
- **Encrypted in transit:** Yes.
- **Account creation:** Username and password; OAuth.
- **External accounts:** Users can sign in with a Google account created outside the app.
- **Account deletion URL:** `https://big-two.chiubaca.com/account`.
- **Partial data deletion without deleting the account:** No. Users can instead delete their whole
  account and associated authentication data.
- **Sharing:** No data shared with third parties. Cloudflare processes data as a contracted service
  provider, and Google sign-in is a user-initiated action.
- **Ephemeral processing:** None of the declared data types is marked as ephemeral.

Declared collection and purposes:

| Data type           | Required or optional | Purposes                                                                         |
| ------------------- | -------------------- | -------------------------------------------------------------------------------- |
| Name                | Optional             | App functionality; account management                                            |
| Email address       | Optional             | App functionality; account management                                            |
| User IDs            | Optional             | App functionality; fraud prevention, security and compliance; account management |
| Photos              | Optional             | Account management                                                               |
| Diagnostics         | Required             | Analytics                                                                        |
| App interactions    | Required             | App functionality; analytics                                                     |
| Other actions       | Optional             | App functionality                                                                |
| Device or other IDs | Optional             | App functionality; fraud prevention, security and compliance; account management |

IP addresses are used for session security and rate limiting, not to infer location, so location is
not declared. Personal data is not sold or used for targeted advertising.

## Play Console status

- Internal release `1 (1.0.0)` is active for the `Testers` email list.
- Store listing, app access, target audience, content rating, and Data safety changes are saved in
  Publishing overview but have not been sent for review.
- App content shows no outstanding declarations.
- Content rating declares decorative gambling themes, with no playable gambling, wagering, prizes,
  purchases, or redeemable value. Australia rates this as Parental Guidance with mild gambling
  themes; other generated ratings range from all ages to 16 depending on the territory.
- Publishing overview currently keeps **Send app for review** disabled. The dashboard requires a
  closed-testing release, at least 12 opted-in testers, and 14 days of qualifying closed testing
  before production access can be requested.
- A Play-installed build still needs verification on an Android device. The internal opt-in URL is
  `https://play.google.com/apps/internaltest/4701694469301389582`.

## Release order

1. Create the Play Console app with package ID `com.chiubaca.bigtwocrew`.
2. Upload `app-release-bundle.aab` to **Internal testing** and enable Play App Signing.
3. Verify every current and previous Play app-signing SHA-256 fingerprint remains in the web Digital
   Asset Links file as documented in `README.md`, then deploy the frontend if any changed.
4. Finish Store listing, App content, Data safety, Content rating, and target-audience forms.
5. Add trusted testers and verify the installed test build opens without a browser toolbar.
6. Run the required closed test with at least 12 opted-in testers for at least 14 days, then apply for
   production access.
7. Submit production for review only after the staged listing and policy changes have been reviewed.
