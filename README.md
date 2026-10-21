# UNBOUND website

A static site with no build step: plain HTML, CSS and JavaScript.

## Run it locally

From this folder, start any static server and open the address it prints:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve .` if you have Node. Opening `index.html` by double-click mostly works too, but the founder cards, calendar and fonts behave best on a local server.

Useful switches for testing:

- `?static=1` shows every animation in its final state (for screenshots and print)
- `?flip=1,2` opens founder cards by number
- `?talk=Your+question` opens the chat bar with that question asked
- `?dryrun=1` records form submissions in `window.__fwSent` instead of sending them

## Files

- `index.html`: the homepage (hero, story, what we do, services, why UNBOUND, manifesto, founders, process, booking, footer)
- `contact/index.html`: contact page with a message form
- `css/site.css`: the base design system (grid, type, buttons, cards, founder cards, calendar)
- `css/unbound.css`: UNBOUND palette and the new sections and motion
- `js/site.js`: nav, tabs, reveal-on-scroll, hanging founder cards, booking calendar, chat bar, forms
- `js/unbound.js`: headline and word rotator, scroll-drawn story paths, compare toggle, manifesto highlight, scroll progress, magnetic buttons
- `assets/team/`: founder portraits (`himani.jpg`, `amisha.jpg`)
- `assets/qr/`: QR codes for each founder's LinkedIn

## Palette

| Role | Name | Hex |
| --- | --- | --- |
| Primary | Ink | `#0A0A0B` |
| Primary | White | `#FFFFFF` |
| Primary | Flame | `#FF4A1C` |
| Primary | Ultraviolet | `#4F2BF5` |
| Secondary | Saffron | `#FFC23A` |
| Secondary | Lilac | `#CBBEFF` |
| Secondary | Mint | `#2DD4A7` |

Tokens live at the top of `css/site.css` (`--flame`, `--violet`, `--saffron`, `--lilac`, `--mint`).

## Things to swap in before going live

1. **Founder photos.** `assets/team/himani.jpg` and `assets/team/amisha.jpg` are monogram placeholders. Replace each with a portrait of the same name (portrait crop, roughly 4:5, face in the upper third). If a face sits too high or low, adjust `object-position` on that founder's `<img>` tags in `index.html`.
2. **Email address.** Every "Email us" link and booking invite uses `hello@example.com`. Search and replace it in `index.html`, `contact/index.html` and `js/site.js` (`SITE.emails`).
3. **Forms.** The subscribe and contact forms need somewhere to send to. Put an inbox in `formTo` in `js/site.js` to use FormSubmit (formsubmit.co sends a one-time activation email the first time), or a web app URL in `leadUrl`. With both empty, the forms offer to open the visitor's own email app instead.
4. **Booking link.** The calendar works without a backend: it opens a Google Calendar invite to the founders. To use Cal.com or Calendly instead, paste the link into `bookingUrl` in `js/site.js`.
5. **Founder details.** The story and the backs of the founder cards are written without specific employers or years. Add the real experience lines in the `#story` section and the `.tm-back` blocks in `index.html`.
