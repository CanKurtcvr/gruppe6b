// ---------------- 12 Yoga Poses with Strict Red/Orange/Green Limb Grading ----------------
const YOGA_LIBRARY = [
  {
    id: 1,
    name: "1. Træet (Samlede hænder)",
    subtitle: "Vrksasana — Balance & Fokus",
    instruction:
      "Stå rankt i rolig balance, saml håndfladerne præcist foran hjertet, og løft den ene fod op mod det modsatte ben.",
    voiceIntro:
      "Find ro i kroppen. Stå helt oprejst, saml håndfladerne foran hjertet, og løft blidt den ene fod op mod det andet ben.",
    crop: { x: 5, y: 15, w: 150, h: 325 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: m.shoulderMid.y + m.torsoLength * 0.34,
          r: m.shoulderWidth * 0.32,
          label: "Saml hænder ved hjertet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const la = pose.left_ankle;
      const ra = pose.right_ankle;
      const lk = pose.left_knee;
      const rk = pose.right_knee;

      const heartX = m.shoulderMid.x;
      const heartY = m.shoulderMid.y + m.torsoLength * 0.34;

      // 1. Strict Torso check
      const tiltRatio = m.shoulderTilt / m.shoulderWidth;
      const torsoState = gradeError(tiltRatio, 0.16, 0.3);
      const torsoAdvice =
        pose.left_shoulder.y > pose.right_shoulder.y
          ? "Løft venstre skulder blidt, så din overkrop er i vater."
          : "Løft højre skulder blidt, så din overkrop er i vater.";

      // 2. Strict Left & Right Arm prayer position check
      const lDist = ptOK(lw) ? dist2D(lw, { x: heartX, y: heartY }) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, { x: heartX, y: heartY }) / m.shoulderWidth : 9;
      const handsGap = ptOK(lw) && ptOK(rw) ? dist2D(lw, rw) / m.shoulderWidth : 9;

      const leftArmState = worstGrade(
        gradeError(lDist, 0.42, 0.78),
        gradeError(handsGap, 0.55, 0.95)
      );
      const rightArmState = worstGrade(
        gradeError(rDist, 0.42, 0.78),
        gradeError(handsGap, 0.55, 0.95)
      );

      const leftArmAdvice = getDirectionalAdvice(
        lw,
        heartX,
        heartY,
        "venstre hånd",
        m,
        leftArmState
      );
      const rightArmAdvice = getDirectionalAdvice(
        rw,
        heartX,
        heartY,
        "højre hånd",
        m,
        rightArmState
      );

      // 3. Strict Tree Leg check
      let legState = "green";
      let legAdvice = "Hold balancen roligt på dit støtteben.";
      if (ptOK(la, 0.32) && ptOK(ra, 0.32)) {
        const ankleLiftRatio = Math.abs(la.y - ra.y) / m.torsoLength;
        const kneeSpreadRatio =
          ptOK(lk) && ptOK(rk) ? Math.abs(lk.x - rk.x) / m.shoulderWidth : 0;
        const liftGrade = gradeError(Math.max(0, 0.34 - ankleLiftRatio), 0.0, 0.14);
        const kneeGrade = gradeError(Math.max(0, 0.85 - kneeSpreadRatio), 0.0, 0.25);
        legState = bestGrade(liftGrade, kneeGrade);
        if (legState !== "green") {
          legAdvice =
            legState === "orange"
              ? "Du er i den orange zone med benet... løft foden lidt højere op mod inderlåret og åbn knæet ud til siden."
              : "Løft nænsomt den ene fod op langs det modsatte ben for at komme ind i Træet.";
        }
      }

      const armsCombined = worstGrade(leftArmState, rightArmState);
      const guidelines = [
        {
          label: "Rank overkrop og skuldre i rolig balance",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: torsoAdvice,
        },
        {
          label: "Håndflader samlet præcist foran hjertet",
          state: armsCombined,
          passed: armsCombined === "green",
          voiceHint: leftArmState !== "green" ? leftArmAdvice : rightArmAdvice,
        },
        {
          label: "Løft den ene fod op mod det modsatte ben",
          state: legState,
          passed: legState === "green",
          voiceHint: legAdvice,
        },
      ];

      const limbStates = {
        torso: torsoState,
        leftArm: leftArmState,
        rightArm: rightArmState,
        leftLeg: legState,
        rightLeg: legState,
      };

      const allGreen = guidelines.every((g) => g.state !== "red");
      const firstNotGreen =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates,
        guidelines,
        hint: allGreen
          ? "Smukt... hele kroppen er i grøn harmoni. Træk vejret roligt."
          : firstNotGreen.voiceHint,
      };
    },
  },
  {
    id: 2,
    name: "2. Træet (Arme over hovedet)",
    subtitle: "Vrksasana — Strakte Arme",
    instruction:
      "Hold balancen og stræk begge arme højt op over hovedet med håndfladerne samlet lige over issen.",
    voiceIntro:
      "Lad armene svæve nænsomt op over hovedet, og saml dine håndflader lige over issen.",
    crop: { x: 155, y: 5, w: 155, h: 335 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.max(42, m.shoulderMid.y - m.torsoLength * 0.92),
          r: m.shoulderWidth * 0.34,
          label: "Saml hænder over hovedet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const targetX = m.shoulderMid.x;
      const targetY = Math.max(42, m.shoulderMid.y - m.torsoLength * 0.92);

      const tiltRatio = m.shoulderTilt / m.shoulderWidth;
      const torsoState = gradeError(tiltRatio, 0.17, 0.32);

      const lDist = ptOK(lw) ? dist2D(lw, { x: targetX, y: targetY }) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, { x: targetX, y: targetY }) / m.shoulderWidth : 9;
      const handsGap = ptOK(lw) && ptOK(rw) ? dist2D(lw, rw) / m.shoulderWidth : 9;

      const leftArmState = worstGrade(
        gradeError(lDist, 0.48, 0.85),
        gradeError(handsGap, 0.65, 1.1)
      );
      const rightArmState = worstGrade(
        gradeError(rDist, 0.48, 0.85),
        gradeError(handsGap, 0.65, 1.1)
      );

      const leftAdvice = getDirectionalAdvice(
        lw,
        targetX,
        targetY,
        "venstre arm",
        m,
        leftArmState
      );
      const rightAdvice = getDirectionalAdvice(
        rw,
        targetX,
        targetY,
        "højre arm",
        m,
        rightArmState
      );

      const guidelines = [
        {
          label: "Venstre arm strakt præcist op over hovedet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: leftAdvice,
        },
        {
          label: "Højre arm strakt og samlet over hovedet",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: rightAdvice,
        },
        {
          label: "Overkrop og skuldre i rolig lodret linje",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Ret ryggen blidt op og hold skuldrene lige.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: torsoState,
          rightLeg: torsoState,
        },
        guidelines,
        hint: allGreen
          ? "Skønt stræk... hold roen i den grønne zone."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 3,
    name: "3. Trekantsstilling (Trikonasana)",
    subtitle: "Sidebøjning & Åbent Bryst",
    instruction:
      "Stå bredt, bøj overkroppen til siden, før den ene hånd ned til skinnebenet og stræk den anden arm lige mod himlen.",
    voiceIntro:
      "Stå bredt med benene. Lad den ene hånd glide ned langs benet, mens den anden arm strækkes nænsomt mod himlen.",
    crop: { x: 315, y: 95, w: 215, h: 245 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.78),
          r: m.shoulderWidth * 0.34,
          label: "Øverste hånd",
        },
        {
          x: m.shoulderMid.x,
          y: Math.min(440, m.hipMid.y + m.torsoLength * 0.48),
          r: m.shoulderWidth * 0.34,
          label: "Nederste hånd",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const topTarget = {
        x: m.shoulderMid.x,
        y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.78),
      };
      const botTarget = {
        x: m.shoulderMid.x,
        y: Math.min(440, m.hipMid.y + m.torsoLength * 0.48),
      };

      // Determine which hand is acting as upper vs lower
      const leftIsUpper = ptOK(lw) && ptOK(rw) ? lw.y <= rw.y : true;
      const upperWrist = leftIsUpper ? lw : rw;
      const lowerWrist = leftIsUpper ? rw : lw;

      const upperErr = ptOK(upperWrist)
        ? Math.max(0, (upperWrist.y - topTarget.y) / m.torsoLength)
        : 9;
      const lowerErr = ptOK(lowerWrist)
        ? Math.max(0, (botTarget.y - lowerWrist.y) / m.torsoLength)
        : 9;

      const upperState = gradeError(upperErr, 0.22, 0.5);
      const lowerState = gradeError(lowerErr, 0.22, 0.5);

      const tiltRatio = m.shoulderTilt / m.shoulderWidth;
      const torsoState = gradeError(Math.max(0, 0.22 - tiltRatio), 0.0, 0.14);

      const leftArmState = leftIsUpper ? upperState : lowerState;
      const rightArmState = leftIsUpper ? lowerState : upperState;

      const guidelines = [
        {
          label: "Øverste arm strakt lige op mod himlen",
          state: upperState,
          passed: upperState === "green",
          voiceHint: getDirectionalAdvice(
            upperWrist,
            topTarget.x,
            topTarget.y,
            "den øverste arm",
            m,
            upperState
          ),
        },
        {
          label: "Nederste hånd ført ned mod skinnebenet",
          state: lowerState,
          passed: lowerState === "green",
          voiceHint: getDirectionalAdvice(
            lowerWrist,
            botTarget.x,
            botTarget.y,
            "den nederste hånd",
            m,
            lowerState
          ),
        },
        {
          label: "Overkroppen bøjet blidt til siden",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Vip overkroppen og skuldrene lidt mere til siden i trekantsstillingen.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Harmonisk Trekantsstilling... mærk strækket i siden."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 4,
    name: "4. Dyb Squat (Malasana)",
    subtitle: "Garland Squat — Jordforbindelse",
    instruction:
      "Bøj knæene dybt, sænk hofterne nænsomt ned, og saml håndfladerne præcist foran hjertet.",
    voiceIntro:
      "Sænk hofterne blidt ned i en dyb squat, og saml håndfladerne foran hjertet.",
    crop: { x: 525, y: 165, w: 165, h: 175 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: m.shoulderMid.y + m.torsoLength * 0.35,
          r: m.shoulderWidth * 0.32,
          label: "Hænder ved brystet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lk = pose.left_knee;
      const rk = pose.right_knee;
      const heart = {
        x: m.shoulderMid.x,
        y: m.shoulderMid.y + m.torsoLength * 0.35,
      };

      const lDist = ptOK(lw) ? dist2D(lw, heart) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, heart) / m.shoulderWidth : 9;
      const leftArmState = gradeError(lDist, 0.42, 0.78);
      const rightArmState = gradeError(rDist, 0.42, 0.78);

      let squatDepthErr = Math.max(0, (215 - m.shoulderMid.y) / 90);
      if (ptOK(lk, 0.3) && ptOK(rk, 0.3)) {
        const kneeMidY = (lk.y + rk.y) * 0.5;
        squatDepthErr = Math.max(
          0,
          Math.abs(m.hipMid.y - kneeMidY) / m.torsoLength - 0.38
        );
      }
      const legState = gradeError(squatDepthErr, 0.14, 0.34);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.16, 0.32);

      const armsCombined = worstGrade(leftArmState, rightArmState);
      const guidelines = [
        {
          label: "Håndflader samlet præcist foran brystet",
          state: armsCombined,
          passed: armsCombined === "green",
          voiceHint:
            leftArmState !== "green"
              ? getDirectionalAdvice(lw, heart.x, heart.y, "venstre hånd", m, leftArmState)
              : getDirectionalAdvice(rw, heart.x, heart.y, "højre hånd", m, rightArmState),
        },
        {
          label: "Hofter sænket dybt ned i squat",
          state: legState,
          passed: legState === "green",
          voiceHint:
            legState === "orange"
              ? "Du er tæt på... sænk hofterne en lille smule dybere ned i din squat."
              : "Bøj knæene og sænk hofterne nænsomt længere ned mod gulvet.",
        },
        {
          label: "Løftet bryst og lige skuldre",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold brystet løftet og skuldrene lige.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: legState,
          rightLeg: legState,
        },
        guidelines,
        hint: allGreen
          ? "Stærk og rolig Malasana... træk vejret dybt."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 5,
    name: "5. Skrædderstilling (Sukhasana)",
    subtitle: "Indre Ro & Balance",
    instruction:
      "Sid med rank ryg og lad begge hænder hvile symmetrisk ude på dine knæ.",
    voiceIntro:
      "Sid behageligt med rank ryg. Lad skuldrene falde på plads, og hvil hænderne blidt på dine knæ.",
    crop: { x: 15, y: 345, w: 170, h: 165 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x - m.shoulderWidth * 0.82,
          y: m.hipMid.y + m.torsoLength * 0.08,
          r: m.shoulderWidth * 0.3,
          label: "Venstre hånd",
        },
        {
          x: m.shoulderMid.x + m.shoulderWidth * 0.82,
          y: m.hipMid.y + m.torsoLength * 0.08,
          r: m.shoulderWidth * 0.3,
          label: "Højre hånd",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lTarget = {
        x: m.shoulderMid.x - m.shoulderWidth * 0.82,
        y: m.hipMid.y + m.torsoLength * 0.08,
      };
      const rTarget = {
        x: m.shoulderMid.x + m.shoulderWidth * 0.82,
        y: m.hipMid.y + m.torsoLength * 0.08,
      };

      const lDist = ptOK(lw) ? dist2D(lw, lTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, rTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.45, 0.82);
      const rightArmState = gradeError(rDist, 0.45, 0.82);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.15, 0.28);

      const guidelines = [
        {
          label: "Rank ryg og afslappede skuldre",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Ret ryggen blidt op og sænk skuldrene.",
        },
        {
          label: "Venstre hånd hviler roligt på venstre knæ",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            lTarget.x,
            lTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd hviler roligt på højre knæ",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            rTarget.x,
            rTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Fuldkommen ro... nyd vejrtrækningen i den grønne zone."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 6,
    name: "6. Siddende Bedestilling",
    subtitle: "Anjali Mudra — Hjertefokus",
    instruction:
      "Sid oprejst med krydsede ben og saml håndfladerne præcist midt foran hjertet.",
    voiceIntro:
      "Før håndfladerne blidt sammen foran hjertet, og mærk roen brede sig i kroppen.",
    crop: { x: 195, y: 345, w: 155, h: 165 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: m.shoulderMid.y + m.torsoLength * 0.35,
          r: m.shoulderWidth * 0.3,
          label: "Saml hænder ved hjertet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const heart = {
        x: m.shoulderMid.x,
        y: m.shoulderMid.y + m.torsoLength * 0.35,
      };

      const lDist = ptOK(lw) ? dist2D(lw, heart) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, heart) / m.shoulderWidth : 9;
      const gap = ptOK(lw) && ptOK(rw) ? dist2D(lw, rw) / m.shoulderWidth : 9;

      const leftArmState = worstGrade(
        gradeError(lDist, 0.38, 0.72),
        gradeError(gap, 0.5, 0.9)
      );
      const rightArmState = worstGrade(
        gradeError(rDist, 0.38, 0.72),
        gradeError(gap, 0.5, 0.9)
      );
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.15, 0.28);

      const guidelines = [
        {
          label: "Rank og harmonisk overkrop",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Sid rankt med begge skuldre i samme højde.",
        },
        {
          label: "Venstre hånd placeret ved hjertet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            heart.x,
            heart.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd samlet ved hjertet",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            heart.x,
            heart.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Smuk balance ved hjertet... bliv i den grønne ro."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 7,
    name: "7. Sommerfuglen (Baddha Konasana)",
    subtitle: "Hofteåbner & Stilhed",
    instruction:
      "Sid med fodsålerne samlet og ræk begge hænder lavt ned i skødet for at omslutte fødderne.",
    voiceIntro:
      "Saml fodsålerne foran dig, og lad begge hænder hvile lavt nede omkring dine fødder.",
    crop: { x: 355, y: 350, w: 160, h: 165 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.min(445, m.hipMid.y + m.torsoLength * 0.16),
          r: m.shoulderWidth * 0.34,
          label: "Saml hænder i skødet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lapTarget = {
        x: m.shoulderMid.x,
        y: Math.min(445, m.hipMid.y + m.torsoLength * 0.16),
      };

      const lDist = ptOK(lw) ? dist2D(lw, lapTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, lapTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.45, 0.82);
      const rightArmState = gradeError(rDist, 0.45, 0.82);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.16, 0.3);

      const guidelines = [
        {
          label: "Lang og rank rygsøjle",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold overkroppen lang og sænk skuldrene blidt.",
        },
        {
          label: "Venstre hånd ført lavt ned i skødet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            lapTarget.x,
            lapTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd samlet nede ved fødderne",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            lapTarget.x,
            lapTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Dejlig Sommerfugle-stilling... giv slip i hofterne."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 8,
    name: "8. Siddende Balance",
    subtitle: "Kerne & Åbne Arme",
    instruction:
      "Find balancen på sædet og stræk begge arme bredt og symmetrisk ud til hver side.",
    voiceIntro:
      "Åbn brystet og stræk begge arme blidt og bredt ud til siderne i rolig balance.",
    crop: { x: 515, y: 355, w: 185, h: 160 },
    getTargetZones(m) {
      return [
        {
          x: Math.max(45, m.shoulderMid.x - m.shoulderWidth * 1.18),
          y: m.shoulderMid.y + m.torsoLength * 0.18,
          r: m.shoulderWidth * 0.32,
          label: "Venstre arm ud",
        },
        {
          x: Math.min(595, m.shoulderMid.x + m.shoulderWidth * 1.18),
          y: m.shoulderMid.y + m.torsoLength * 0.18,
          r: m.shoulderWidth * 0.32,
          label: "Højre arm ud",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const lTarget = {
        x: Math.max(45, m.shoulderMid.x - m.shoulderWidth * 1.18),
        y: m.shoulderMid.y + m.torsoLength * 0.18,
      };
      const rTarget = {
        x: Math.min(595, m.shoulderMid.x + m.shoulderWidth * 1.18),
        y: m.shoulderMid.y + m.torsoLength * 0.18,
      };

      const lDist = ptOK(lw) ? dist2D(lw, lTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, rTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.45, 0.85);
      const rightArmState = gradeError(rDist, 0.45, 0.85);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.16, 0.3);

      const guidelines = [
        {
          label: "Overkroppen i centreret balance",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold overkroppen rank og i rolig balance.",
        },
        {
          label: "Venstre arm strakt ud til venstre",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            lTarget.x,
            lTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre arm strakt ud til højre",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            rTarget.x,
            rTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Flot siddende balance... mærk styrken og roen."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 9,
    name: "9. Kriger I (Warrior I)",
    subtitle: "Virabhadrasana — Styrke & Nærvær",
    instruction:
      "Træd ud i udfaldstrin og stræk begge arme lige og parallelt op over skuldrene.",
    voiceIntro:
      "Træd stille ud i Kriger 1, og løft begge arme strakt op mod himlen med bløde skuldre.",
    crop: { x: 15, y: 520, w: 170, h: 210 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.85),
          r: m.shoulderWidth * 0.42,
          label: "Stræk begge arme op",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const topTarget = {
        x: m.shoulderMid.x,
        y: Math.max(45, m.shoulderMid.y - m.torsoLength * 0.85),
      };

      const lDist = ptOK(lw) ? dist2D(lw, topTarget) / m.shoulderWidth : 9;
      const rDist = ptOK(rw) ? dist2D(rw, topTarget) / m.shoulderWidth : 9;

      const leftArmState = gradeError(lDist, 0.55, 0.95);
      const rightArmState = gradeError(rDist, 0.55, 0.95);
      const torsoState = gradeError(m.shoulderTilt / m.shoulderWidth, 0.18, 0.34);

      const guidelines = [
        {
          label: "Venstre arm løftet strakt op mod himlen",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            topTarget.x,
            topTarget.y,
            "venstre arm",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre arm løftet strakt op mod himlen",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            topTarget.x,
            topTarget.y,
            "højre arm",
            m,
            rightArmState
          ),
        },
        {
          label: "Stabil og oprejst overkrop i udfaldstrin",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Hold overkroppen rank og brystet åbent.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: torsoState,
          rightLeg: torsoState,
        },
        guidelines,
        hint: allGreen
          ? "Stærk og harmonisk Kriger-stilling... træk vejret dybt."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 10,
    name: "10. Hundestrækket (Downward Dog)",
    subtitle: "Adho Mukha Svanasana",
    instruction:
      "Bøj overkroppen frem og ned i et omvendt V med hænderne rakt langt ned mod gulvet.",
    voiceIntro:
      "Lad overkroppen glide nænsomt fremad i Hundestrækket med hænderne mod gulvet og hofterne løftet.",
    crop: { x: 175, y: 585, w: 235, h: 145 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.min(445, m.hipMid.y + m.torsoLength * 0.45),
          r: m.shoulderWidth * 0.42,
          label: "Hænder mod gulvet",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const floorTarget = {
        x: m.shoulderMid.x,
        y: Math.min(445, m.hipMid.y + m.torsoLength * 0.45),
      };

      const foldErr = Math.max(
        0,
        (m.hipMid.y - m.torsoLength * 0.15 - m.shoulderMid.y) / m.torsoLength
      );
      const torsoState = gradeError(foldErr, 0.15, 0.4);

      const lErr = ptOK(lw)
        ? Math.max(0, (floorTarget.y - lw.y) / m.torsoLength)
        : 9;
      const rErr = ptOK(rw)
        ? Math.max(0, (floorTarget.y - rw.y) / m.torsoLength)
        : 9;

      const leftArmState = gradeError(lErr, 0.25, 0.55);
      const rightArmState = gradeError(rErr, 0.25, 0.55);

      const guidelines = [
        {
          label: "Overkroppen bøjet fremad under hofternes højde",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint:
            torsoState === "orange"
              ? "Du er tæt på... sænk overkroppen og hovedet en smule længere ned."
              : "Bøj forsigtigt overkroppen frem og ned, så hofterne er øverst.",
        },
        {
          label: "Venstre arm strakt ned mod gulvet",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            floorTarget.x,
            floorTarget.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre arm strakt ned mod gulvet",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            floorTarget.x,
            floorTarget.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: torsoState,
          rightLeg: torsoState,
        },
        guidelines,
        hint: allGreen
          ? "Dejligt Hundestræk... mærk længden i rygsøjlen."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 11,
    name: "11. Trebenet Hundestræk",
    subtitle: "Eka Pada Adho Mukha Svanasana",
    instruction:
      "Støt forsigtigt med hænderne mod gulvet og løft det ene ben højt og strakt op bagud.",
    voiceIntro:
      "Fra Hundestrækket løfter du nu det ene ben blidt og strakt op mod himlen.",
    crop: { x: 405, y: 550, w: 205, h: 180 },
    getTargetZones(m) {
      return [
        {
          x: m.shoulderMid.x,
          y: Math.min(445, m.hipMid.y + m.torsoLength * 0.42),
          r: m.shoulderWidth * 0.42,
          label: "Støt med hænderne",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const la = pose.left_ankle;
      const ra = pose.right_ankle;

      const foldErr = Math.max(
        0,
        (m.hipMid.y - m.torsoLength * 0.1 - m.shoulderMid.y) / m.torsoLength
      );
      const torsoState = gradeError(foldErr, 0.18, 0.42);

      const handsDownErr =
        ptOK(lw) && ptOK(rw)
          ? Math.max(0, (m.shoulderMid.y - Math.max(lw.y, rw.y)) / m.torsoLength)
          : 9;
      const armState = gradeError(handsDownErr, 0.05, 0.28);

      let legState = torsoState;
      if (ptOK(la, 0.3) && ptOK(ra, 0.3)) {
        const diffRatio = Math.abs(la.y - ra.y) / m.torsoLength;
        legState = gradeError(Math.max(0, 0.38 - diffRatio), 0.0, 0.16);
      }

      const guidelines = [
        {
          label: "Overkroppen bøjet roligt fremad",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint: "Sænk overkroppen blidt frem og ned mod gulvet.",
        },
        {
          label: "Hænderne støtter lavt foran kroppen",
          state: armState,
          passed: armState === "green",
          voiceHint: "Ræk begge hænder længere ned mod gulvet.",
        },
        {
          label: "Det ene ben løftet højt bagud",
          state: legState,
          passed: legState === "green",
          voiceHint:
            legState === "orange"
              ? "Næsten i grøn... løft det bagerste ben en anelse højere op."
              : "Løft nænsomt det ene ben højt op bag dig.",
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: armState,
          rightArm: armState,
          leftLeg: legState,
          rightLeg: legState,
        },
        guidelines,
        hint: allGreen
          ? "Smukt Trebenet Hundestræk... hold den rolige linje."
          : nextFix.voiceHint,
      };
    },
  },
  {
    id: 12,
    name: "12. Stående Foroverbøjning",
    subtitle: "Uttanasana — Giv Slip",
    instruction:
      "Stå med lige ben, fold overkroppen helt forover og lad hænderne hvile nede ved anklerne.",
    voiceIntro:
      "Giv slip i nakke og skuldre. Fold overkroppen blidt helt forover ned mod dine ben.",
    crop: { x: 590, y: 545, w: 105, h: 185 },
    getTargetZones(m) {
      return [
        {
          x: m.hipMid.x,
          y: Math.min(448, m.hipMid.y + m.torsoLength * 0.55),
          r: m.shoulderWidth * 0.38,
          label: "Hænder ved anklerne",
        },
      ];
    },
    evaluate(pose, m) {
      const lw = pose.left_wrist;
      const rw = pose.right_wrist;
      const target = {
        x: m.hipMid.x,
        y: Math.min(448, m.hipMid.y + m.torsoLength * 0.55),
      };

      const foldErr = Math.max(
        0,
        (m.hipMid.y - m.shoulderMid.y) / m.torsoLength
      );
      const torsoState = gradeError(foldErr, 0.15, 0.42);

      const lDist = ptOK(lw) ? Math.max(0, (target.y - lw.y) / m.torsoLength) : 9;
      const rDist = ptOK(rw) ? Math.max(0, (target.y - rw.y) / m.torsoLength) : 9;

      const leftArmState = gradeError(lDist, 0.25, 0.55);
      const rightArmState = gradeError(rDist, 0.25, 0.55);

      const guidelines = [
        {
          label: "Overkrop og hoved foldet dybt og afslappet ned",
          state: torsoState,
          passed: torsoState === "green",
          voiceHint:
            torsoState === "orange"
              ? "Du er tæt på... lad hovedet og skuldrene synke lidt længere ned."
              : "Fold overkroppen nænsomt forover fra hoften.",
        },
        {
          label: "Venstre hånd rakt ned mod anklerne",
          state: leftArmState,
          passed: leftArmState === "green",
          voiceHint: getDirectionalAdvice(
            lw,
            target.x,
            target.y,
            "venstre hånd",
            m,
            leftArmState
          ),
        },
        {
          label: "Højre hånd rakt ned mod anklerne",
          state: rightArmState,
          passed: rightArmState === "green",
          voiceHint: getDirectionalAdvice(
            rw,
            target.x,
            target.y,
            "højre hånd",
            m,
            rightArmState
          ),
        },
      ];

      const allGreen = guidelines.every((g) => g.state !== "red");
      const nextFix =
        guidelines.find((g) => g.state === "orange") ||
        guidelines.find((g) => g.state === "red");

      return {
        matched: allGreen,
        limbStates: {
          torso: torsoState,
          leftArm: leftArmState,
          rightArm: rightArmState,
          leftLeg: "green",
          rightLeg: "green",
        },
        guidelines,
        hint: allGreen
          ? "Dyb og rolig Foroverbøjning... lad åndedrættet flyde."
          : nextFix.voiceHint,
      };
    },
  },
];

