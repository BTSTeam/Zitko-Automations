'use client'
import React from 'react';

type SocialMode = 'jobPosts' | 'generalPosts';

export default function SocialMediaTab({ mode }: { mode: SocialMode }) {
  return (
    <div>
      <h2 className="text-xl font-bold">
        {mode === 'jobPosts' ? 'Job Posts' : 'General Posts'}
      </h2>
      <p>Content for {mode === 'jobPosts' ? 'Job Posts' : 'General Posts'} will go here.</p>
    </div>
  );
}
