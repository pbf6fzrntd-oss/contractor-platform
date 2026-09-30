# Showing the app to prospects

There are two ways to demo. Both use the real app, not slides or mockups.

## 1. "Try it live" (best for sales calls and leaving behind)

1. Open `https://YOUR-SITE/demo` (or tap **▶ Try the live demo** on the home page).
2. Pick the prospect's trade. In about a second they're inside their **own private demo business**:
   - about three months of history: missed calls, texts, estimates, won and lost jobs, review requests;
   - for trades: a week of booked visits;
   - for lawn and landscaping: 26 recurring customers, today's route, last week's rain delay and a seasonal campaign.
3. The yellow **🎬 Demo** bar at the top has **▶ Try it** buttons that play the customer's side.

Each visitor gets a separate business, so you can send the link to a prospect after the call and they can click around on their own. Demo businesses:
- use a pretend number (area code 555), so **nothing can ever text a real phone**, even on the live site;
- can't buy a number, start billing or submit carrier registration;
- are hidden from search engines, and are **deleted automatically after 24 hours**.

**To turn it on:** set `DEMO_MODE=on` in the site's settings (Vercel → Project → Settings → Environment Variables). Leave it off to hide `/demo`. Changing it doesn't need a rebuild.

## 2. Your own demo logins (for practising)

`npm run demo:seed` (dev database only) creates two fixed businesses you can log into any time:
- lawn care: `dana@lawn.test` / `password123`;
- roofing: `rick@roof.test` / `password123`.

## A 10-minute demo script

Share your screen on a laptop; the app has a side menu and the inbox sits next to the conversation. Or hand them your phone; it works the same.

1. **Open with their pain (1 min).** "How many calls do you miss while you're on a roof / under a house / on a mower? What happens to those people?" (They call the next company on Google.)
2. **Pick their trade on /demo (30 sec).** "This is a practice version of your business. Three months of activity."
3. **Miss a call (2 min).** ▶ Try it → **Miss a call from a new customer**.
   - "A customer just called while you were busy. Before you even looked at your phone, they got this text, and they answered."
   - Read the automatic text out loud; it's written for their trade.
   - Type a reply in the box and send it.
4. **The follow-up machine (2 min).** On that conversation, set the stage to **Estimate sent** and enter an amount.
   - "Now you never have to remember to follow up." The follow-ups are listed under the conversation, and they stop by themselves if the customer answers.
   - Press **⏩ Jump ahead in time**: "Here's a week later."
5. **The money (2 min).** Open **Dashboard**. Walk through three numbers:
   - **Won, last 30 days;**
   - **Saved from missed calls;**
   - **Open estimates**: "$46,000 sitting in quotes waiting on an answer."
6. **Their world (2 min).**
   - Trades: **Schedule**, and **🗓 Book online as a customer**. The prospect books a visit on their own booking page, and it shows up in "Waiting for you".
   - Lawn: **Today** → **🌧 Rain delay**: "Rain? Two taps and your whole route knows, in English or Spanish."
7. **Spanish (30 sec).** ▶ Try it → **…in Spanish**. "Spanish-speaking customers get Spanish texts automatically."
8. **Close.** "Want me to set this up with your real number? You keep your number; missed calls just forward to us." Then send them the /demo link so they can play with it tonight.

## Good to know
- The texting simulator (📱 in the side menu) shows the customer's phone: text the business as a customer and watch the reply arrive.
- If a button seems to do nothing, refresh. Demo businesses are fresh every time; tap **Pick another trade** to start over.
- Prices, names and messages are made up. Spanish text should be reviewed by a native speaker before launch (same as the rest of the app).
