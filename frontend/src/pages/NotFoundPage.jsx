import React from 'react';
import { Link } from 'react-router-dom';
import { PageShell, PageHeader } from '../components/page-chrome/PageChrome';
import { Button } from '../components/workflow/WorkflowUi';

export default function NotFoundPage() {
  return <PageShell>
    <PageHeader eyebrow="S.H.I.E.L.D. · siden findes ikke" title="Vi kunne ikke finde siden" lede="Linket kan være forældet, eller adressen kan være skrevet forkert. Gå til startsiden for at søge efter sagen, dokumentet eller vejledningen." />
    <Button as={Link} to="/">Gå til startsiden</Button>
  </PageShell>;
}
