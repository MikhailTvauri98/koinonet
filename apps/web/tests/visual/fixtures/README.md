# NASA photo fixtures

Actual JPEG photographs downloaded from Wikimedia Commons on 2026-11-01. Each download ran once with no retry and a20-second total timeout. Files are Wikimedia thumbnails, unchanged locally; no generated images or user photos are used.

| File | Decoded size / bytes | Author / source and licensing page | Exact downloaded bytes |
| --- | --- | --- | --- |
| photo-square.jpg | 500×500 /20259 | NASA / Bill Anders, Earthrise, Apollo8,1968. [Source and PD-NASA license](https://commons.wikimedia.org/wiki/File:NASA-Apollo8-Dec24-Earthrise.jpg) | [JPEG](https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/NASA-Apollo8-Dec24-Earthrise.jpg/500px-NASA-Apollo8-Dec24-Earthrise.jpg) |
| photo-portrait.jpg | 500×637 /84127 | NASA, Charles F. Bolden Jr. official portrait, S86-37233,1986. [Source and PD-NASA license](https://commons.wikimedia.org/wiki/File:Charles_Bolden_astronaut_photo.jpg) | [JPEG](https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Charles_Bolden_astronaut_photo.jpg/500px-Charles_Bolden_astronaut_photo.jpg) |
| photo-landscape.jpg | 960×612 /214032 | NASA / crew of STS-132, International Space Station, s132e012208,2010. [Source and PD-NASA license](https://commons.wikimedia.org/wiki/File:International_Space_Station_after_undocking_of_STS-132.jpg) | [JPEG](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/960px-International_Space_Station_after_undocking_of_STS-132.jpg) |

The Licensing sections on these three source pages were read and identify each photograph as public domain (PD-NASA). Use here is restricted to visual test data and implies no endorsement by NASA or the person pictured. System.Drawing decoded the downloaded files and confirmed the dimensions above. Browser decoding and layout with these photographs passed in installed Microsoft Edge156.0.4314.58; the verified scope and retained evidence are recorded in [design acceptance](../../../../../docs/design-acceptance.md). This is evidence for that Chromium browser, not Firefox/WebKit or physical devices.

`document.txt` is a nonempty UTF-8 attachment supplied with a long Russian filename by the tests. The prior icon/UI-screenshot PNGs have been replaced, so the active tests use actual photographs.

The `/__acceptance_media/` interceptor returns these controlled local bytes to the real Nuxt UI. This proves browser decoding and layout when the tests run, but does not prove nginx X-Accel-Redirect delivery, signed-file authorization, server image processing, HEIC/EXIF or physical iPhone/Android file selection. Hardware and deployed-environment checks remain separate; a desktop viewport is not a physical device.
