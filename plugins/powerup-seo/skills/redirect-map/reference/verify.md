# After launch: verify the redirects

Run the `verify` command from step 7 of SKILL.md.

It requests every old URL (relative paths are joined to `--base`) and checks: the first hop is 301/308 (302/307 → warn), it ends at the expected page (normalised), at most one hop (2 → warn, more → fail), the final page answers 200, and 410 rows answer 410 or 404. Fix the `problems` list, then run it again. For a full go-live check, hand over to the **launch** skill, which runs this too. Without network access, check 10–20 of the most valuable URLs by hand with your web tool and say it was a sample.
