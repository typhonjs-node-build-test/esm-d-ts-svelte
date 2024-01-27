import {
   ClassDeclaration,
   Node }            from 'ts-morph';
import ts            from 'typescript';

/**
 * Provides the postprocessing of the intermediate Svelte component declarations transforming the declaration format
 * to a better structure for library consumption. Instead of named type alias exports the output of `svelte2tsx` is
 * transformed into a namespace w/ exported type aliases that matches the name of the Svelte component. This allows the
 * entire declaration for a Svelte component to be exported when
 * `export { default as <COMPONENT_NAME> } from './<COMPONENT_NAME>.svelte'` is utilized.
 *
 * JSDoc comments are also rejoined to the generated declaration for props and a component header comment.
 */
export class PostprocessDTS
{
   /**
    * @param {object}   data - Data.
    *
    * @param {import('./JSDocCommentParser.js').JSDocResults} comments - Any parsed comments.
    *
    * @param {import('@typhonjs-utils/logger-color').ColorLogger} data.logger -
    *
    * @param {import('ts-morph').SourceFile} data.sourceFile - `ts-morph` SourceFile.
    */
   static process({ comments, logger, sourceFile })
   {
      this.#transform(comments, logger, sourceFile);
   }

   /**
    * Transforms the default declaration output of `svelte2tsx` creating a better declaration structure for
    * consumption and documentation.
    *
    * @param {import('./JSDocCommentParser.js').JSDocResults} comments - Any parsed comments.
    *
    * @param {import('@typhonjs-utils/logger-color').ColorLogger} logger -
    *
    * @param {import('ts-morph').SourceFile} sourceFile - `ts-morph` SourceFile.
    */
   static #transform(comments, logger, sourceFile)
   {
      // Alter default exported class --------------------------------------------------------------------------------

      /** @type {ClassDeclaration} */
      const classDeclaration = sourceFile.getDefaultExportSymbol()?.getDeclarations()?.[0];
      if (!classDeclaration)
      {
         // TODO: Cancel processing
      }

      const className = classDeclaration.getName();

      classDeclaration.setIsExported(false);
      classDeclaration.setHasDeclareKeyword(true);

      if (comments?.componentDescription)
      {
         classDeclaration.addJsDoc(comments.componentDescription);
      }

      const heritageClause = classDeclaration.getHeritageClauseByKind(ts.SyntaxKind.ExtendsKeyword);

      if (!heritageClause)
      {
         // TODO: Cancel processing
      }

      const svelteComponentTypeArgs = heritageClause.getTypeNodes()[0];

      if (svelteComponentTypeArgs && Node.isExpressionWithTypeArguments(svelteComponentTypeArgs))
      {
         const typeArguments = svelteComponentTypeArgs.getTypeArguments();

         if (typeArguments.length === 3)
         {
            typeArguments[0].replaceWithText(`${className}.Props`);
            typeArguments[1].replaceWithText(`${className}.Events`);
            typeArguments[2].replaceWithText(`${className}.Slots`);
         }
      }

      // Extract type alias definitions from `__propDef` variable ----------------------------------------------------

      const propDef = sourceFile.getVariableDeclaration('__propDef');

      if (!propDef)
      {
         // TODO: Cancel processing
      }

      const propsType = propDef.getType().getProperty('props').getValueDeclaration().getType().getText();
      const eventsType = propDef.getType().getProperty('events').getValueDeclaration().getType().getText();
      const slotsType = propDef.getType().getProperty('slots').getValueDeclaration().getType().getText();

      // Remove unused `__propDef` variable.
      propDef.remove();

      // ----------------

      // Create a namespace
      const namespace = sourceFile.addModule({ name: className, hasDeclareKeyword: true });

      // Add type aliases to the namespace
      const propAlias = namespace.addTypeAlias({ name: 'Props', type: propsType, isExported: true });
      const eventAlias = namespace.addTypeAlias({ name: 'Events', type: eventsType, isExported: true });
      const slotAlias = namespace.addTypeAlias({ name: 'Slots', type: slotsType, isExported: true });

      propAlias.addJsDoc({ description: `Props type alias for {@link ${className}}.` });
      eventAlias.addJsDoc({ description: `Events type alias for {@link ${className}}.` });
      slotAlias.addJsDoc({ description: `Slots type alias for {@link ${className}}.` });

      namespace.addJsDoc({ description: `Event / Prop / Slot type aliases for {@link ${className}}.` });

      if (comments?.props.size)
      {
         const propTypeNode = propAlias.getTypeNode();

         if (Node.isTypeElementMembered(propTypeNode))
         {
            for (const propertyNode of propTypeNode.getProperties())
            {
               const propertyName = propertyNode.getName();
               if (comments.props.has(propertyName))
               {
                  // Note: due to a `prettier` bug the full text must be manipulated instead of working with
                  // `JSDocStructure` / `addJsDoc`.
                  const fullText = propertyNode.getFullText();
                  propertyNode.replaceWithText(`\n${comments.props.get(propertyName)}\n${fullText}`);
               }
            }
         }
      }

      // Remove all type aliases -------------------------------------------------------------------------------------

      const typeAliases = sourceFile.getTypeAliases();
      for (const typeAlias of typeAliases) { typeAlias.remove(); }

      // Add default export ------------------------------------------------------------------------------------------

      sourceFile.addExportAssignment({ expression: className, isExportEquals: false });
   }
}