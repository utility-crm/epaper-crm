import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, FileText, AlertCircle, Info, Mail } from 'lucide-react';

interface ReaderInfoPageProps {
  slug: string;
  basePath: string;
  orgName: string;
  type: 'privacy' | 'disclaimer' | 'terms' | 'about' | 'contact';
}

export const ReaderInfoPage: React.FC<ReaderInfoPageProps> = ({
  slug,
  basePath,
  orgName,
  type,
}) => {
  const pubName = orgName || slug.toUpperCase();

  const getContent = () => {
    switch (type) {
      case 'privacy':
        return {
          title: 'Privacy Policy',
          icon: <ShieldCheck className="h-8 w-8 text-amber-500" />,
          sections: [
            {
              heading: '1. Introduction & Information We Collect',
              body: `${pubName} ePaper Edition respects your digital privacy. We collect minimal technical data required to display digital editions, maintain secure reader accounts, and provide customized news content across devices.`,
            },
            {
              heading: '2. Use of Reader Account Information',
              body: 'When you sign up or subscribe to our digital newspaper editions, your phone number or email is used exclusively for account authentication, digital delivery notifications, and subscription management. We never sell your personal contact details to third parties.',
            },
            {
              heading: '3. Digital Clipping & Sharing',
              body: 'When utilizing our article clipping and sharing feature, shared links render only the specific clip coordinates requested. No private user data is attached to shared article clips.',
            },
            {
              heading: '4. Contacting Our Data Protection Team',
              body: `If you have questions regarding privacy practices for ${pubName}, please reach out to our editorial office or support team.`,
            },
          ],
        };
      case 'disclaimer':
        return {
          title: 'Legal Disclaimer',
          icon: <AlertCircle className="h-8 w-8 text-amber-500" />,
          sections: [
            {
              heading: '1. Accuracy of Journalistic Content',
              body: `The digital replica editions published on ${pubName} ePaper are verified reproductions of our daily newspaper publication. While every effort is made to maintain factual accuracy, news reports represent information available at press time.`,
            },
            {
              heading: '2. Third-Party Advertisements & Syndication',
              body: 'Advertisements, public notices, and commercial listings contained within the newspaper pages represent the respective advertisers. The publisher assumes no legal liability for external claims made in commercial advertisements.',
            },
            {
              heading: '3. Copyright & Digital Ownership',
              body: `All page layouts, photographs, headlines, and articles are copyright © ${pubName}. Unauthorized commercial reproduction or scraping of complete PDF editions is strictly prohibited under applicable intellectual property laws.`,
            },
          ],
        };
      case 'terms':
        return {
          title: 'Terms & Conditions of Service',
          icon: <FileText className="h-8 w-8 text-amber-500" />,
          sections: [
            {
              heading: '1. Access to ePaper Digital Editions',
              body: `Access to ${pubName} ePaper is granted for personal, non-commercial reading and sharing of individual article clips. Subscription access is tied to your individual reader account.`,
            },
            {
              heading: '2. Fair Use & Article Clipping',
              body: 'Readers are permitted to use the built-in clipping tool to share individual articles or news snippets on social media or messaging platforms, provided the publication source attribution remains intact.',
            },
            {
              heading: '3. Account Security & Cancellation',
              body: 'You are responsible for maintaining the confidentiality of your reader account credentials. Subscriptions can be managed or cancelled at any time through your reader profile.',
            },
          ],
        };
      case 'about':
        return {
          title: `About ${pubName}`,
          icon: <Info className="h-8 w-8 text-amber-500" />,
          sections: [
            {
              heading: 'Our Digital Publication',
              body: `${pubName} brings trusted daily journalism to your desktop, tablet, and mobile device with high-fidelity digital ePaper replicas, instant article clipping, and interactive reading.`,
            },
            {
              heading: 'Editorial Mission',
              body: 'Dedicated to fearless journalism, regional coverage, and community engagement, our ePaper platform ensures our readers stay informed anywhere, anytime.',
            },
          ],
        };
      default:
        return {
          title: 'Contact Us',
          icon: <Mail className="h-8 w-8 text-amber-500" />,
          sections: [
            {
              heading: 'Editorial & Reader Support',
              body: `For circulation assistance, advertisement inquiries, or editorial feedback regarding ${pubName} ePaper, please contact our office desk.`,
            },
            {
              heading: 'Platform Technical Support',
              body: 'Powered by EpaperSpace.com — for platform-related support or digital publishing inquiries, visit epaperspace.com.',
            },
          ],
        };
    }
  };

  const content = getContent();

  return (
    <div className="min-h-[70vh] bg-slate-900 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          to={basePath || '/'}
          className="inline-flex items-center gap-2 text-sm text-amber-500 hover:text-amber-400 mb-8 transition-colors font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {pubName} Home
        </Link>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-10 shadow-xl">
          <div className="flex items-center gap-4 border-b border-slate-700 pb-6 mb-8">
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-700">
              {content.icon}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                {content.title}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Official Document • {pubName} ePaper Edition
              </p>
            </div>
          </div>

          <div className="space-y-8">
            {content.sections.map((section, idx) => (
              <div key={idx} className="space-y-2">
                <h2 className="text-lg font-semibold text-white">
                  {section.heading}
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {section.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-slate-700/80 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 gap-4">
            <div>
              © {new Date().getFullYear()} {pubName}. All rights reserved.
            </div>
            <Link
              to={basePath || '/'}
              className="text-amber-500 hover:underline font-medium"
            >
              Return to Today&apos;s Edition →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
