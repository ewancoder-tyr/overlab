import {
    EnvironmentProviders,
    inject,
    makeEnvironmentProviders,
    provideAppInitializer,
} from '@angular/core';
import { BuddyPush, BuddyRemote } from '@leaderboard/application/buddy-ports';
import { BuddiesService } from '@leaderboard/application/buddies.service';
import { LeaderboardCache, LeaderboardRemote } from '@leaderboard/application/leaderboard-ports';
import { LeaderboardService } from '@leaderboard/application/leaderboard.service';
import { HttpBuddyRemote } from './http-buddy-remote';
import { HttpLeaderboardRemote } from './http-leaderboard-remote';
import { LocalStorageLeaderboardCache } from './local-storage-leaderboard-cache';
import { PushBuddyChannel } from './push-buddy-channel';

/**
 * Wires the leaderboard to the browser. Called from `app.config.ts`; removing that call, the
 * `leaderboard` folder and its few places in pages removes the leaderboard from the app.
 *
 * Creating the service at start-up lets it report experience whichever page is open. When the
 * network returns it finishes a leave that could not reach the server. The buddies service is
 * created up front for the same reason: it tells buddies about a set from any page.
 */
export function provideLeaderboard(): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: LeaderboardRemote, useClass: HttpLeaderboardRemote },
        { provide: LeaderboardCache, useClass: LocalStorageLeaderboardCache },
        { provide: BuddyRemote, useClass: HttpBuddyRemote },
        { provide: BuddyPush, useClass: PushBuddyChannel },
        provideAppInitializer(() => {
            const leaderboard = inject(LeaderboardService);
            inject(BuddiesService);
            window.addEventListener('online', () => {
                leaderboard.retry();
            });
        }),
    ]);
}
