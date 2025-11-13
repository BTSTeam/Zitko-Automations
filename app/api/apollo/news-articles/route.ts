import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API route used to search news articles for a given organization.
 *
 * This route mirrors the behaviour of `job-postings/route.ts` but queries
 * Apollo’s news articles search endpoint.  It automatically calculates a
 * date range spanning the last 90 days and passes the organisation ID along
 * with pagination parameters.
 */
export async function POST(req: NextRequest) {
  try {
    // Extract the organisation ID from the request body
    const { organization_id } = await req.json();
    if (!organization_id) {
      return NextResponse.json(
        { error: 'Missing organisation ID' },
        { status: 400 },
      );
    }

    // Compute the upper (maxDate) and lower (minDate) bounds for the
    // published_at filters.  Apollo requires YYYY‑MM‑DD strings.
    const now = new Date();
    const maxDate = now.toISOString().split('T')[0];
    const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const minDate = past.toISOString().split('T')[0];

    // Build the query string for page=1 & per_page=2 and the date range
    const searchParams = new URLSearchParams({
      'published_at[min]': minDate,
      'published_at[max]': maxDate,
      page: '1',
      per_page: '2',
    });
    const url = `https://api.apollo.io/api/v1/news_articles/search?${searchParams.toString()}`;

    // Send the organisation IDs as an array in the body
    const body = JSON.stringify({
      organization_ids: [organization_id],
    });

    // Retrieve the API token in the same way as job-postings/route.ts
    const tokenCookie = cookies().get('apolloToken');
    const token = tokenCookie?.value || process.env.APOLLO_API_KEY;

    // Execute the call to Apollo's API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `News article search failed: ${error}` },
        { status: response.status },
      );
    }

    // Return whatever Apollo returns so the frontend can map it
    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
