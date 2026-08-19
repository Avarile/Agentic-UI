import { useLocalize } from '~/hooks';

export default function Showcase() {
  const localize = useLocalize();

  return (
    <section className="hidden flex-1 shrink basis-1/2 items-center justify-center border-r border-border-light p-10 lg:flex">
      <div className="max-w-xl">
        <h2 className="text-balance text-5xl font-bold leading-tight tracking-tight text-text-primary xl:text-6xl">
          {localize('com_auth_showcase_title')}
        </h2>
        <p className="mt-8 text-lg text-text-secondary">
          {localize('com_auth_showcase_description')}
        </p>
      </div>
    </section>
  );
}
