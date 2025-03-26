---
title: "Developers are doomed"
title_short: "Developers are doomed"
introduction: "<p>Remember when we used to write code? When we'd spend hours debugging, refactoring, and optimizing our work? Those days are numbered. The regular developer's obituary is being written, and AI is holding the pen.</p><p>I was a bit late to the generative AI party. I followed the news closely, but I tend to be skeptical these days. Skeptical about the latest Silicon Valley hype and skeptical when privacy concerns are involved. But now I've seen the future, and it doesn't include all of us.</p>"
date: 2025-03-26T10:25:10+01:00
author: "Bram Willemse"
type: "articles"
url: "/articles/developers-are-doomed/"
description: "The rise of AI tools like GitHub Copilot and Claude Code is fundamentally changing the role of developers. Are we witnessing the end of traditional coding?"
reading_time: "7 minutes"
featured_image:
  src: /images/developers-are-doomed/developers-are-doomed.jpg
  alt: "Photorealistic scene of an abandoned office with a skeleton slumped over a keyboard, while a glowing AI robot stands in the background overseeing empty workstations — a symbolic depiction of the end of human developers and the rise of AI."
parent:
  title: "Feed"
  url: "/feed"
  icon: "list"
draft: false
---

## Seeing
After keeping my hands off, at the end of 2023 I started to realize generative AI was here to stay and I began seeing the potential while my team and I pitched an improved data architecture to FedEx execs. (Who remembers [tiny Bram](https://www.linkedin.com/posts/bramwillemse_had-a-lovely-last-day-at-fedexyesterday-activity-7115629213189066752-KrT_)?) Introducing a proper integration layer also gave them the opportunity to easily plug in OpenAI solutions, for example to provide fallback answers for specific topics based on FAQ content that our department had been working hard on to clean up and update. We ran some prototypes using LlamaIndex that already provided answers - like a new tool in a toolbox that some people are hesitant to use because they don't fully understand its potential.

The company wasn't ready for it, for many reasons of which politics and lack of understanding were definitely a part and that was that. I moved on, but couldn't ignore AI anymore.

## Playing
First off in 2024, I started writing with the help of chatGPT and it really helped me [write a fitting profile](https://bramwillemse.nl/) for myself as a product owner and helped me write messages and motivational letters finding new jobs. Throughout the year I played with ChatGPT as a copywriter, agile coach, general knowledge base and more - imagine having a personal assistant who can help you write, research, and even coach you on various topics. Then in winter I got introduced to Perplexity as an example of how outdated Google Search is (in terms of UX) and in the last few months Claude won me over by being a bit more tentative and precise than chatGPT tending to a bit too creative at times.

You might say 2024 is also the year I threw overboard my worries about what would happen to my private data, and just went for it. Because I can't ignore anymore the momentum of AI and the influence it will have in the time to come.

## Copy-pasting
Last month I started working on my personal website. (Yes, your'e looking at it.) It always is a lovely project to keep busy when in between jobs. I wanted to try to implement [CSS Subgrid](https://dev.to/harishrajora12/css-subgrid-what-is-it-and-why-you-need-it-1p94 "Read about CSS Subgrid on dev.to"), which I hadn't worked with yet and of course I had to fix my outdated Webpack setup (and then fix my Netlify build & deploy... 🙄). I started asking Claude to explain the basics. Copy pasted some attempts into the macOS app and got some good input. After a week Claude 3.7 was released and the answers noticeably improved. Cool. It's like having a tutor who gets better at teaching you as they learn more about your needs.

Then I spoke to a former FedEx colleague who showed me his Github Copilot setup and told me how it helped him build a working API integration feature during a 30-minute conference meeting. It was as good as ready for release. The same day I installed Github Copilot in Visual Studio Code.
## Copiloting
I already knew this was possible, but starting to use Copilot myself really flipped the switch for me. I had been moving away from it the last few years, since I haven't done any serious web development since 2022-'23. But switching back to the developer perspective made me see: developers are doomed. I guess I see dead people now. ☠️

Github Copilot is a chat window in my IDE (code editing app) and you can tell it to look at your workspace, current files you're working on or even a current code selection and a combination of all the above. You can also include terminal input, like build errors (very useful) so it can debug where your code is going wrong by itself. It's pretty great, but it also is a lot of manual work to gather the right files and selections to provide the most valuable context to Copilot - imagine having a co-pilot in a plane who can take over the controls and fly the plane for you, but only when it's safe and you're keeping a close eye. Enter Claude Code.

## Vibing
Lucky as I am, a week later Claude Code was released. Claude Code is a CLI application (it runs in your system's terminal). It looks for the right files and code for context by itself and if it has an idea how to fix it, it will ask you for permissions to change your code, build, commit and even push changes. It truly does the work for you - think of Claude Code as a self-driving car that takes you to your destination while you sit back and relax. Where I had to review, accept and save any change Copilot made in Visual Studio, Claude Code just does it all for you. Like any AI, the less you instruct it, the more mistakes it makes and the more crap code it writes.

{{<video src="https://www.youtube-nocookie.com/embed/AJpK3YTTKZ4" title="Anthropic's introduction of Claude Code" caption="Anthropic's introduction of Claude Code" >}}

In half a day it had built me a working Flickr API integration (that's why you now see my latest photos in the Feed) and even helped add the timeline visual. I manually optimized the HTML and CSS, but didn't touch or inspect any of the Flickr code. In a day or 2, I got work done that would've taken me a week or 2. I would've had to learn about best practices for importing external content in Hugo and spent hours coding the timeline visual, testing and optimizing the look and feel.

## Preaching
What a difference a few weeks make. After going through all of the above, I know one thing for sure: developers are dead because AI will do the work for us. ☠️ Feed your AI with the right requirements, acceptance criteria, visual designs, architectural plans and coding guidelines and your AI of choice can already do the coding, building, testing and deployment. Your work will be to review the results and tell it where to optimize. AI is like a new team member who can handle complex tasks, allowing us to focus on higher-level decision-making.

Yes, right now it's still a lot of work to have your AI do your work. But every week these AI models are improving and getting better at their job. The gap between "good enough" and "perfect" is shrinking daily.

## Doom
So what are we going to do about it? Will we be the last human standing in a room full of AI ghosts, stubbornly writing every line of code ourselves? Or will we evolve into something new - the AI conductor, the prompt engineer, the architect of ideas rather than implementations?

*Developers are dead. Long live AI engineers! I guess? Or what will we call them?* 🤷‍♂️